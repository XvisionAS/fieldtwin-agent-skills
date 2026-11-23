#!/usr/bin/env node
// Deploys a static FieldTwin integration to the FieldTwin instance that will host it.
// Node 20.15 or later, no dependencies. Talks only to the instance URL the user names.
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const PROJECT_FILE = '.fieldtwin.json'
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const REFRESH_MARGIN_MS = 60 * 1000
const BOOLEAN_FLAGS = new Set(['json', 'yes', 'no-browser'])
const EXIT_LOGIN_REQUIRED = 3
// A refresh the server refuses with one of these means the login is gone; any other failure may pass.
const REFUSED_LOGIN_STATUSES = new Set([400, 401, 403])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
// The server's limit on the unzipped size of a bundle.
const MAX_EXTRACTED_BYTES = 100 * 1024 * 1024

/** A failure to report to the user: `code` is stable for agents, `message` is for people. */
class CliError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [exitCode]
   * @param {number} [status] the HTTP status, when the server answered
   */
  constructor(code, message, exitCode = 1, status = undefined) {
    super(message)
    this.code = code
    this.exitCode = exitCode
    this.status = status
  }
}

/**
 * @param {string[]} argv
 * @returns {{positional: string[], flags: Record<string, string|boolean>}}
 */
function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
    } else if (BOOLEAN_FLAGS.has(arg.slice(2))) {
      flags[arg.slice(2)] = true
    } else {
      flags[arg.slice(2)] = argv[++index]
    }
  }
  return { positional, flags }
}

// ---- stored state ---------------------------------------------------------------------------

/** @returns {string} */
function credentialsPath() {
  const base = process.platform === 'win32' ? process.env.APPDATA : path.join(os.homedir(), '.config')
  return path.join(base, 'fieldtwin', 'integrations.json')
}

/** @returns {Record<string, {accessToken: string, refreshToken: string, accessExpiresAt: number}>} keyed by instance URL */
function readCredentials() {
  try {
    return JSON.parse(fs.readFileSync(credentialsPath(), 'utf8'))
  } catch {
    return {}
  }
}

/**
 * @param {ReturnType<typeof readCredentials>} credentials
 * @returns {void}
 */
function writeCredentials(credentials) {
  const file = credentialsPath()
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, JSON.stringify(credentials, null, 2), { mode: 0o600 })
  fs.chmodSync(file, 0o600)
}

/** @returns {{instanceUrl: string, accountId: string, integrationId: string}|null} */
function readProject() {
  try {
    return JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf8'))
  } catch {
    return null
  }
}

// ---- HTTP -----------------------------------------------------------------------------------

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
async function request(url, options) {
  let response
  try {
    // A redirect must never replay a token, an authorization code or a bundle elsewhere.
    response = await fetch(url, { ...options, redirect: 'error' })
  } catch (error) {
    const reason = error.cause ? error.cause.message : error.message
    throw new CliError('request-failed', `The request to ${new URL(url).origin} failed: ${reason}`)
  }
  if (response.ok) {
    return response
  }
  const body = await response.json().catch(() => ({}))
  const code = body.error || `http-${response.status}`
  throw new CliError(code, body.detail || body.error_description || `${code} (${response.status})`, 1, response.status)
}

/**
 * @param {URL} url
 * @returns {boolean} true for https, or http on a loopback host
 */
function isSecureUrl(url) {
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
}

/**
 * Checks the token endpoint's answer before anything is stored.
 * @param {any} tokens
 * @param {boolean} isCodeExchange the first login also returns a refresh token
 * @returns {void}
 */
function assertValidTokens(tokens, isCodeExchange) {
  const isText = (value) => typeof value === 'string' && value !== ''
  const isValid =
    tokens &&
    isText(tokens.access_token) &&
    typeof tokens.expires_in === 'number' &&
    tokens.expires_in > 0 &&
    (!isCodeExchange || isText(tokens.refresh_token))
  if (!isValid) {
    throw new CliError('invalid-token-response', 'The instance answered the login with an unusable token response.')
  }
}

/**
 * @param {string} instance
 * @returns {Promise<{enabled: boolean, clientId: string, loginUrl: string, integrationsOrigin: string, maxBundleBytes: number}>}
 */
async function getConfig(instance) {
  const hostingDisabled = new CliError('hosting-disabled', `Integration hosting is not enabled on ${instance}.`)
  let config
  try {
    config = await (await request(`${instance}/backend/integrations/config`)).json()
  } catch (error) {
    // An instance that predates integration hosting has no such route.
    throw error.status === 404 ? hostingDisabled : error
  }
  if (!config.enabled) {
    throw hostingDisabled
  }
  return config
}

/**
 * @param {string} instance
 * @returns {CliError} the error that asks the user to log in again
 */
function loginRequired(instance) {
  return new CliError('login-required', `Not logged in to ${instance}. Run: login --url ${instance}`, EXIT_LOGIN_REQUIRED)
}

/**
 * Forgets the stored login for an instance.
 * @param {string} instance
 * @returns {CliError} the error that asks the user to log in again
 */
function dropLogin(instance) {
  const credentials = readCredentials()
  delete credentials[instance]
  writeCredentials(credentials)
  return loginRequired(instance)
}

/**
 * A valid access token for the instance, refreshed when it is about to expire.
 * @param {string} instance
 * @returns {Promise<string>}
 */
async function accessToken(instance) {
  const credentials = readCredentials()
  const stored = credentials[instance]
  if (!stored) {
    throw loginRequired(instance)
  }
  if (stored.accessExpiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return stored.accessToken
  }
  let tokens
  try {
    const response = await request(`${instance}/backend/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: stored.refreshToken }),
    })
    tokens = await response.json()
  } catch (error) {
    // Only a refusal means the 7-day refresh token expired or the grant was revoked.
    // A network error, a 5xx or a throttling 4xx (408, 429) must keep the login.
    throw REFUSED_LOGIN_STATUSES.has(error.status) ? dropLogin(instance) : error
  }
  assertValidTokens(tokens, false)
  stored.accessToken = tokens.access_token
  stored.accessExpiresAt = Date.now() + tokens.expires_in * 1000
  writeCredentials(credentials)
  return stored.accessToken
}

/**
 * Calls the management API as the logged-in user.
 * @param {string} instance
 * @param {string} method
 * @param {string} apiPath path under /backend/integrations
 * @param {Buffer} [zip]
 * @returns {Promise<Response>}
 */
async function api(instance, method, apiPath, zip) {
  const headers = { Authorization: `Bearer ${await accessToken(instance)}` }
  if (zip) {
    headers['Content-Type'] = 'application/zip'
  }
  try {
    return await request(`${instance}/backend/integrations${apiPath}`, { method, headers, body: zip })
  } catch (error) {
    // The token is not expired but dead: the grant was revoked, or the user logged in again
    // elsewhere, which ends this login.
    throw error.status === 403 && error.code === 'invalid-credential' ? dropLogin(instance) : error
  }
}

// ---- login ----------------------------------------------------------------------------------

/**
 * @param {string} url
 * @returns {void}
 */
function openInBrowser(url) {
  // Never through a shell: the URL is data, not a command line.
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]]
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {})
}

/**
 * Waits on a loopback port for the browser to come back from the FieldTwin login page.
 * @param {(redirectUri: string) => string} buildAuthorizeUrl
 * @param {string} state the value the callback must echo
 * @param {boolean} shouldOpenBrowser
 * @param {string} [warning] printed after the URL when the browser is not opened for a reason
 * @returns {Promise<{code: string, redirectUri: string}>}
 */
function receiveAuthorizationCode(buildAuthorizeUrl, state, shouldOpenBrowser, warning) {
  return new Promise((resolve, reject) => {
    let redirectUri
    const server = http.createServer((req, res) => {
      let url
      try {
        url = new URL(req.url, redirectUri)
      } catch {
        res.writeHead(400).end()
        return
      }
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      // A stray local request must not end the login: only the callback carrying our state counts.
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400).end()
        return
      }
      const failure = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<p>${!failure && code ? 'Logged in. You can close this tab.' : 'Login was not completed.'}</p>`)
      clearTimeout(timeout)
      server.close()
      if (failure) {
        reject(new CliError('login-denied', `Login was cancelled (${failure}).`))
      } else if (!code) {
        reject(new CliError('login-failed', 'The login callback carried no authorization code.'))
      } else {
        resolve({ code, redirectUri })
      }
    })
    const timeout = setTimeout(() => {
      server.close()
      reject(new CliError('login-timeout', 'No login was completed within 5 minutes.'))
    }, LOGIN_TIMEOUT_MS)
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}/callback`
      const authorizeUrl = buildAuthorizeUrl(redirectUri)
      console.error(`Open this URL to log in to FieldTwin:\n${authorizeUrl}`)
      if (shouldOpenBrowser) {
        openInBrowser(authorizeUrl)
      } else if (warning) {
        console.error(warning)
      }
    })
  })
}

/**
 * @param {string} instance
 * @param {boolean} shouldOpenBrowser
 * @returns {Promise<void>}
 */
async function login(instance, shouldOpenBrowser) {
  const config = await getConfig(instance)
  let loginUrl
  try {
    loginUrl = new URL(config.loginUrl)
  } catch {
    // reported below with the other unacceptable values
  }
  if (!loginUrl || !isSecureUrl(loginUrl)) {
    throw new CliError('invalid-login-url', `${instance} gave a login URL that is not https.`)
  }
  const isSameHost = loginUrl.origin === instance
  const warning = isSameHost
    ? undefined
    : `This login page is on a different host (${loginUrl.origin}) than the instance. Check it before opening it.`
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(16).toString('hex')
  const buildAuthorizeUrl = (redirectUri) => {
    const url = new URL(loginUrl)
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('state', state)
    return url.href
  }
  const { code, redirectUri } = await receiveAuthorizationCode(buildAuthorizeUrl, state, shouldOpenBrowser && isSameHost, warning)
  const response = await request(`${instance}/backend/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })
  const tokens = await response.json()
  assertValidTokens(tokens, true)
  const credentials = readCredentials()
  credentials[instance] = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: Date.now() + tokens.expires_in * 1000,
  }
  writeCredentials(credentials)
}

// ---- zip ------------------------------------------------------------------------------------

/**
 * Every public file under a directory, as sorted forward-slash paths relative to it. Bundles are
 * public, so dot-files, dot-directories and node_modules are left out at any depth.
 * @param {string} directory
 * @param {{excluded?: string, skipped: {count: number}}} options `excluded` is an absolute path
 *   that is never listed; `skipped.count` counts the dot-entries and node_modules left out
 * @param {string} [prefix]
 * @returns {string[]}
 */
function listFiles(directory, options, prefix = '') {
  const names = []
  for (const entry of fs.readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      options.skipped.count++
    } else if (path.resolve(directory, relative) === options.excluded) {
      continue
    } else if (entry.isSymbolicLink()) {
      throw new CliError('symlink-not-allowed', `${relative} is a symbolic link; bundles may not contain links.`)
    } else if (entry.isDirectory()) {
      names.push(...listFiles(directory, options, relative))
    } else {
      names.push(relative)
    }
  }
  return names.sort()
}

/**
 * Builds a zip of a directory. Entries are sorted and carry a fixed timestamp, so the same
 * files always give the same bytes and an unchanged redeploy is recognised by the server.
 * @param {string} directory
 * @param {string} [excluded] a file inside the directory that must not be archived (the output)
 * @param {{count: number}} [skipped] receives the number of entries left out, see listFiles
 * @returns {Buffer}
 */
function createZip(directory, excluded = undefined, skipped = { count: 0 }) {
  const names = listFiles(directory, { excluded: excluded && path.resolve(excluded), skipped })
  const FIXED_DOS_DATE = 0x21 // 1980-01-01
  const UTF8_NAMES = 0x0800
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const name of names) {
    const content = fs.readFileSync(path.join(directory, name))
    const compressed = zlib.deflateRawSync(content, { level: 9 })
    const nameBytes = Buffer.from(name)
    const shared = Buffer.alloc(26)
    shared.writeUInt16LE(20, 0) // version needed
    shared.writeUInt16LE(UTF8_NAMES, 2)
    shared.writeUInt16LE(8, 4) // deflate
    shared.writeUInt16LE(0, 6) // time
    shared.writeUInt16LE(FIXED_DOS_DATE, 8)
    shared.writeUInt32LE(zlib.crc32(content), 10)
    shared.writeUInt32LE(compressed.length, 14)
    shared.writeUInt32LE(content.length, 18)
    shared.writeUInt16LE(nameBytes.length, 22)
    shared.writeUInt16LE(0, 24) // extra length

    const localSignature = Buffer.alloc(4)
    localSignature.writeUInt32LE(0x04034b50)
    localParts.push(localSignature, shared, nameBytes, compressed)

    const centralHead = Buffer.alloc(6)
    centralHead.writeUInt32LE(0x02014b50, 0)
    centralHead.writeUInt16LE(0x0314, 4) // made on Unix, so the mode below is read
    const centralTail = Buffer.alloc(14)
    centralTail.writeUInt32LE((0o100644 << 16) >>> 0, 6) // regular file, rw-r--r--
    centralTail.writeUInt32LE(offset, 10)
    centralParts.push(centralHead, shared, centralTail, nameBytes)

    offset += 30 + nameBytes.length + compressed.length
  }
  const central = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  const entryCount = centralParts.length / 4
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entryCount, 8)
  end.writeUInt16LE(entryCount, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, central, end])
}

/**
 * Tells the agent, once, that entries were left out, so it can tell the user.
 * @param {{count: number}} skipped
 * @returns {void}
 */
function reportSkipped(skipped) {
  if (skipped.count) {
    console.error(`Left out ${skipped.count} dot-file, dot-directory or node_modules entries; bundles are public.`)
  }
}

/**
 * Extracts a zip produced by createZip or downloaded from the instance.
 * @param {Buffer} zip
 * @param {string} directory
 * @returns {string[]} the extracted file names
 */
function extractZip(zip, directory) {
  const entries = readZipEntries(zip, directory)
  const names = []
  let total = 0
  const tooLarge = new CliError('bundle-too-large', `The bundle unzips to more than ${MAX_EXTRACTED_BYTES} bytes.`)
  for (const { name, target, method, data } of entries) {
    let content = data
    if (method === 8) {
      try {
        content = zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, MAX_EXTRACTED_BYTES - total) })
      } catch (error) {
        throw error.code === 'ERR_BUFFER_TOO_LARGE' ? tooLarge : error
      }
    }
    total += content.length
    if (total > MAX_EXTRACTED_BYTES) {
      throw tooLarge
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    names.push(name)
  }
  return names
}

/**
 * Reads and validates the whole central directory, so nothing is written for a bad archive.
 * @param {Buffer} zip
 * @param {string} directory
 * @returns {{name: string, target: string, method: number, data: Buffer}[]} the file entries
 */
function readZipEntries(zip, directory) {
  const endOffset = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (endOffset < 0) {
    throw new CliError('invalid-zip', 'The downloaded bundle is not a zip archive.')
  }
  const entryCount = zip.readUInt16LE(endOffset + 10)
  let cursor = zip.readUInt32LE(endOffset + 16)
  const entries = []
  for (let index = 0; index < entryCount; index++) {
    const method = zip.readUInt16LE(cursor + 10)
    const compressedSize = zip.readUInt32LE(cursor + 20)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const skip = zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32)
    const localOffset = zip.readUInt32LE(cursor + 42)
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    cursor += 46 + nameLength + skip
    const target = path.resolve(directory, name)
    if (!target.startsWith(path.resolve(directory) + path.sep)) {
      throw new CliError('unsafe-entry-name', `Refusing to extract ${name} outside ${directory}.`)
    }
    if (method !== 0 && method !== 8) {
      throw new CliError('unsupported-zip-entry', `${name} uses compression method ${method}; only stored and deflate are supported.`)
    }
    if (name.endsWith('/')) {
      continue
    }
    const dataOffset = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    entries.push({ name, target, method, data: zip.subarray(dataOffset, dataOffset + compressedSize) })
  }
  return entries
}

// ---- commands -------------------------------------------------------------------------------

/**
 * The instance to talk to: the flag, else the linked project, else the only stored login.
 * @param {Record<string, string|boolean>} flags
 * @returns {string}
 */
function resolveInstance(flags) {
  const project = readProject()
  const stored = Object.keys(readCredentials())
  const url = flags.url || (project && project.instanceUrl) || (stored.length === 1 ? stored[0] : undefined)
  if (!url) {
    throw new CliError('instance-required', 'Name the FieldTwin instance with --url https://<instance>.')
  }
  let instance
  try {
    instance = new URL(url)
  } catch {
    throw new CliError('invalid-instance-url', `${url} is not a valid URL. Use https://<instance>.`)
  }
  if (!isSecureUrl(instance)) {
    throw new CliError('insecure-instance-url', `${instance.origin} is not https; a login token is never sent over plain http.`)
  }
  return instance.origin
}

/**
 * @param {string[]} positional
 * @returns {string} the integration id given on the command line
 */
function requireIntegrationId(positional) {
  if (!positional[0]) {
    throw new CliError('integration-id-required', 'Give the integration id as the first argument (see the list command).')
  }
  return positional[0]
}

/**
 * The account to act on: the flag, else the linked project, else the only administered account.
 * @param {string} instance
 * @param {Record<string, string|boolean>} flags
 * @returns {Promise<string>}
 */
async function resolveAccount(instance, flags) {
  const project = readProject()
  if (flags.account || (project && project.accountId)) {
    return flags.account || project.accountId
  }
  const accounts = await (await api(instance, 'GET', '/accounts')).json()
  if (accounts.length === 1) {
    return accounts[0].id
  }
  const choices = accounts.map((account) => `${account.id} (${account.name})`).join(', ')
  throw new CliError(
    accounts.length ? 'account-required' : 'no-administered-account',
    accounts.length ? `Choose an account with --account <id>: ${choices}` : 'You are not an administrator of any account.'
  )
}

const commands = {
  async login({ flags }) {
    const instance = resolveInstance(flags)
    await login(instance, !flags['no-browser'])
    return { result: { instanceUrl: instance, loggedIn: true }, text: `Logged in to ${instance}.` }
  },

  async logout({ flags }) {
    const instance = resolveInstance(flags)
    const credentials = readCredentials()
    delete credentials[instance]
    writeCredentials(credentials)
    return {
      result: { instanceUrl: instance, loggedIn: false },
      text: `Removed the stored login for ${instance}. Revoke the grant under Connected Apps in your FieldTwin user settings.`,
    }
  },

  async accounts({ flags }) {
    const accounts = await (await api(resolveInstance(flags), 'GET', '/accounts')).json()
    return { result: accounts, text: accounts.map((account) => `${account.id}  ${account.name}`).join('\n') }
  },

  async list({ flags }) {
    const instance = resolveInstance(flags)
    const accountId = await resolveAccount(instance, flags)
    const integrations = await (await api(instance, 'GET', `/accounts/${encodeURIComponent(accountId)}/integrations`)).json()
    const describe = (integration) =>
      `${integration.id}  ${integration.name}${integration.hosted ? `  [hosted v${integration.hosted.version}]` : ''}${integration.inherited ? '  [inherited]' : ''}`
    return { result: integrations, text: integrations.map(describe).join('\n') }
  },

  async deploy({ positional, flags }) {
    const directory = positional[0] || 'dist'
    if (!fs.existsSync(path.join(directory, 'manifest.json'))) {
      throw new CliError('missing-manifest', `${directory}/manifest.json not found. Build the integration first.`)
    }
    const instance = resolveInstance(flags)
    const accountId = await resolveAccount(instance, flags)
    const project = readProject()
    if (project && (project.instanceUrl !== instance || project.accountId !== accountId)) {
      throw new CliError(
        'project-link-mismatch',
        `${PROJECT_FILE} links ${project.instanceUrl} account ${project.accountId}, but this deploy targets ${instance} account ${accountId}. Pass the matching --url and --account, or remove ${PROJECT_FILE}.`
      )
    }
    const skipped = { count: 0 }
    const zip = createZip(directory, undefined, skipped)
    reportSkipped(skipped)
    const target = project && project.integrationId
    const accountPath = `/accounts/${encodeURIComponent(accountId)}/integrations`
    const response = target
      ? await api(instance, 'PUT', `${accountPath}/${encodeURIComponent(target)}/bundle`, zip)
      : await api(instance, 'POST', accountPath, zip)
    const { integration, unchanged } = await response.json()
    fs.writeFileSync(PROJECT_FILE, `${JSON.stringify({ instanceUrl: instance, accountId, integrationId: integration.id }, null, 2)}\n`)
    const result = {
      integrationId: integration.id,
      name: integration.name,
      accountId,
      url: integration.url,
      version: integration.hosted.version,
      created: !target,
      unchanged,
    }
    const outcome = unchanged ? 'is already up to date' : target ? `updated to version ${result.version}` : 'created'
    return { result, text: `${integration.name} ${outcome}.\n${integration.url}` }
  },

  // Writes the bundle without deploying it, for an upload through Admin.
  async zip({ positional }) {
    const directory = positional[0] || 'dist'
    const output = positional[1] || 'bundle.zip'
    const skipped = { count: 0 }
    fs.writeFileSync(output, createZip(directory, output, skipped))
    reportSkipped(skipped)
    return { result: { directory, output }, text: `Wrote ${output}.` }
  },

  async link({ positional, flags }) {
    const integrationId = requireIntegrationId(positional)
    const instance = resolveInstance(flags)
    const accountId = await resolveAccount(instance, flags)
    const apiPath = `/accounts/${encodeURIComponent(accountId)}/integrations/${encodeURIComponent(integrationId)}`
    const integration = await (await api(instance, 'GET', apiPath)).json()
    if (!integration.hosted || integration.inherited) {
      throw new CliError('integration-not-hosted', `${integration.name} is not hosted by this account's integration hosting.`)
    }
    fs.writeFileSync(PROJECT_FILE, `${JSON.stringify({ instanceUrl: instance, accountId, integrationId: integration.id }, null, 2)}\n`)
    return { result: { integrationId: integration.id, name: integration.name, accountId }, text: `Linked to ${integration.name}.` }
  },

  async pull({ positional, flags }) {
    const integrationId = requireIntegrationId(positional)
    const instance = resolveInstance(flags)
    const accountId = await resolveAccount(instance, flags)
    const directory = positional[1] || 'bundle'
    const apiPath = `/accounts/${encodeURIComponent(accountId)}/integrations/${encodeURIComponent(integrationId)}/bundle`
    const response = await api(instance, 'GET', apiPath)
    const files = extractZip(Buffer.from(await response.arrayBuffer()), directory)
    return { result: { directory, files }, text: `Extracted ${files.length} files to ${directory}.` }
  },

  async delete({ positional, flags }) {
    const integrationId = requireIntegrationId(positional)
    if (!flags.yes) {
      throw new CliError('confirmation-required', 'Deleting an integration cannot be undone. Repeat with --yes.')
    }
    const instance = resolveInstance(flags)
    const accountId = await resolveAccount(instance, flags)
    await api(instance, 'DELETE', `/accounts/${encodeURIComponent(accountId)}/integrations/${encodeURIComponent(integrationId)}`)
    return { result: { integrationId, deleted: true }, text: `Deleted ${integrationId}.` }
  },

  // The smallest check that fails if packaging breaks: zip twice, compare, extract, compare,
  // then prove a hostile archive is refused before anything is written.
  async 'self-check'() {
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-integrations-source-'))
    const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-integrations-extracted-'))
    try {
      fs.mkdirSync(path.join(source, 'assets'))
      fs.writeFileSync(path.join(source, 'manifest.json'), '{"name":"Check","url":"./index.html"}')
      fs.writeFileSync(path.join(source, 'index.html'), '<h1>é</h1>'.repeat(200))
      fs.writeFileSync(path.join(source, 'assets', 'app.js'), 'run()')
      // What must never be published: dot-entries and installed packages.
      fs.writeFileSync(path.join(source, '.env'), 'SECRET=1')
      fs.mkdirSync(path.join(source, '.git'))
      fs.writeFileSync(path.join(source, '.git', 'HEAD'), 'ref: refs/heads/main')
      fs.mkdirSync(path.join(source, 'node_modules', 'x'), { recursive: true })
      fs.writeFileSync(path.join(source, 'node_modules', 'x', 'i.js'), 'module.exports = 1')

      const first = createZip(source)
      if (!first.equals(createZip(source))) {
        throw new CliError('self-check-failed', 'The same files produced two different zips.')
      }
      // The link file a deploy writes into the folder must not change the next bundle.
      fs.writeFileSync(path.join(source, PROJECT_FILE), '{}')
      if (!first.equals(createZip(source))) {
        throw new CliError('self-check-failed', 'Dot-files or node_modules changed the bundle.')
      }
      const names = extractZip(first, extracted)
      if (names.join() !== 'assets/app.js,index.html,manifest.json') {
        throw new CliError('self-check-failed', `The bundle holds ${names.join()} instead of only the public files.`)
      }
      for (const name of ['assets/app.js', 'index.html', 'manifest.json']) {
        if (!fs.readFileSync(path.join(source, name)).equals(fs.readFileSync(path.join(extracted, name)))) {
          throw new CliError('self-check-failed', `${name} did not survive zip and extract.`)
        }
      }
      assertEscapeRefused(extracted)
      return { result: { ok: true, files: names }, text: 'self-check passed' }
    } finally {
      fs.rmSync(source, { recursive: true, force: true })
      fs.rmSync(extracted, { recursive: true, force: true })
    }
  },
}

/**
 * A zip with one stored entry, built by hand so its name can be hostile.
 * @param {string} name
 * @param {Buffer} content
 * @returns {Buffer}
 */
function zipWithOneStoredEntry(name, content) {
  const nameBytes = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt32LE(content.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt32LE(content.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + nameBytes.length, 12)
  end.writeUInt32LE(local.length + nameBytes.length + content.length, 16)
  return Buffer.concat([local, nameBytes, content, central, nameBytes, end])
}

/**
 * Fails the self-check unless extractZip refuses an entry that escapes its directory.
 * @param {string} parent an existing temporary directory; the extraction target is inside it
 * @returns {void}
 */
function assertEscapeRefused(parent) {
  const hostile = zipWithOneStoredEntry('../escape.txt', Buffer.from('escaped'))
  const target = path.join(parent, 'target')
  let refusal
  try {
    extractZip(hostile, target)
  } catch (error) {
    refusal = error
  }
  if (!refusal || refusal.code !== 'unsafe-entry-name' || fs.existsSync(path.join(parent, 'escape.txt')) || fs.existsSync(target)) {
    throw new CliError('self-check-failed', 'extractZip did not refuse an entry named ../escape.txt.')
  }
}

const [commandName, ...rest] = process.argv.slice(2)
const { positional, flags } = parseArgs(rest)
try {
  if (!Object.hasOwn(commands, commandName)) {
    throw new CliError('unknown-command', `Usage: ft-integrations.mjs <${Object.keys(commands).join('|')}> [--url <instance>] [--account <id>] [--json]`)
  }
  const { result, text } = await commands[commandName]({ positional, flags })
  console.log(flags.json ? JSON.stringify(result) : text)
} catch (error) {
  const failure = { error: error.code || 'unexpected-error', detail: error.message }
  if (flags.json) {
    console.log(JSON.stringify(failure))
  } else {
    console.error(`${failure.error}: ${failure.detail}`)
  }
  process.exitCode = error.exitCode || 1
}
