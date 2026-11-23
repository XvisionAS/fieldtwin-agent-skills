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

/** A failure to report to the user: `code` is stable for agents, `message` is for people. */
class CliError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [exitCode]
   */
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
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
  const response = await fetch(url, options)
  if (response.ok) {
    return response
  }
  const body = await response.json().catch(() => ({}))
  const code = body.error || `http-${response.status}`
  throw new CliError(code, body.detail || body.error_description || `${code} (${response.status})`)
}

/**
 * @param {string} instance
 * @returns {Promise<{enabled: boolean, clientId: string, loginUrl: string, integrationsOrigin: string, maxBundleBytes: number}>}
 */
async function getConfig(instance) {
  const config = await (await request(`${instance}/backend/integrations/config`)).json()
  if (!config.enabled) {
    throw new CliError('hosting-disabled', `Integration hosting is not enabled on ${instance}.`)
  }
  return config
}

/**
 * A valid access token for the instance, refreshed when it is about to expire.
 * @param {string} instance
 * @returns {Promise<string>}
 */
async function accessToken(instance) {
  const credentials = readCredentials()
  const stored = credentials[instance]
  const loginRequired = new CliError('login-required', `Not logged in to ${instance}. Run: login --url ${instance}`, EXIT_LOGIN_REQUIRED)
  if (!stored) {
    throw loginRequired
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
  } catch {
    // The 7-day refresh token expired, or the user revoked the grant.
    delete credentials[instance]
    writeCredentials(credentials)
    throw loginRequired
  }
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
  return request(`${instance}/backend/integrations${apiPath}`, { method, headers, body: zip })
}

// ---- login ----------------------------------------------------------------------------------

/**
 * @param {string} url
 * @returns {void}
 */
function openInBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {})
}

/**
 * Waits on a loopback port for the browser to come back from the FieldTwin login page.
 * @param {(redirectUri: string) => string} buildAuthorizeUrl
 * @param {string} state the value the callback must echo
 * @param {boolean} shouldOpenBrowser
 * @returns {Promise<{code: string, redirectUri: string}>}
 */
function receiveAuthorizationCode(buildAuthorizeUrl, state, shouldOpenBrowser) {
  return new Promise((resolve, reject) => {
    let redirectUri
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const failure = url.searchParams.get('error')
      const isExpected = url.searchParams.get('state') === state
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<p>${!failure && isExpected ? 'Logged in. You can close this tab.' : 'Login was not completed.'}</p>`)
      clearTimeout(timeout)
      server.close()
      if (failure) {
        reject(new CliError('login-denied', `Login was cancelled (${failure}).`))
      } else if (!isExpected) {
        reject(new CliError('login-state-mismatch', 'The login callback did not match this login attempt.'))
      } else {
        resolve({ code: url.searchParams.get('code'), redirectUri })
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
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(16).toString('hex')
  const buildAuthorizeUrl = (redirectUri) => {
    const url = new URL(config.loginUrl)
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('state', state)
    return url.href
  }
  const { code, redirectUri } = await receiveAuthorizationCode(buildAuthorizeUrl, state, shouldOpenBrowser)
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
 * Every file under a directory, as sorted forward-slash paths relative to it.
 * @param {string} directory
 * @param {string} [prefix]
 * @returns {string[]}
 */
function listFiles(directory, prefix = '') {
  const names = []
  for (const entry of fs.readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) {
      throw new CliError('symlink-not-allowed', `${relative} is a symbolic link; bundles may not contain links.`)
    }
    if (entry.isDirectory()) {
      names.push(...listFiles(directory, relative))
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
 * @returns {Buffer}
 */
function createZip(directory) {
  const FIXED_DOS_DATE = 0x21 // 1980-01-01
  const UTF8_NAMES = 0x0800
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const name of listFiles(directory)) {
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
 * Extracts a zip produced by createZip or downloaded from the instance.
 * @param {Buffer} zip
 * @param {string} directory
 * @returns {string[]} the extracted file names
 */
function extractZip(zip, directory) {
  const endOffset = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (endOffset < 0) {
    throw new CliError('invalid-zip', 'The downloaded bundle is not a zip archive.')
  }
  const entryCount = zip.readUInt16LE(endOffset + 10)
  let cursor = zip.readUInt32LE(endOffset + 16)
  const names = []
  for (let index = 0; index < entryCount; index++) {
    const method = zip.readUInt16LE(cursor + 10)
    const compressedSize = zip.readUInt32LE(cursor + 20)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const skip = zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32)
    const localOffset = zip.readUInt32LE(cursor + 42)
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    cursor += 46 + nameLength + skip
    if (name.endsWith('/')) {
      continue
    }
    const target = path.resolve(directory, name)
    if (!target.startsWith(path.resolve(directory) + path.sep)) {
      throw new CliError('unsafe-entry-name', `Refusing to extract ${name} outside ${directory}.`)
    }
    const dataOffset = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    const data = zip.subarray(dataOffset, dataOffset + compressedSize)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, method === 8 ? zlib.inflateRawSync(data) : data)
    names.push(name)
  }
  return names
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
  return new URL(url).origin
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
    const integrations = await (await api(instance, 'GET', `/accounts/${accountId}/integrations`)).json()
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
    const zip = createZip(directory)
    const target = project && project.integrationId
    const response = target
      ? await api(instance, 'PUT', `/accounts/${accountId}/integrations/${target}/bundle`, zip)
      : await api(instance, 'POST', `/accounts/${accountId}/integrations`, zip)
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
    fs.writeFileSync(output, createZip(directory))
    return { result: { directory, output }, text: `Wrote ${output}.` }
  },

  async link({ positional, flags }) {
    const instance = resolveInstance(flags)
    const accountId = await resolveAccount(instance, flags)
    const integration = await (await api(instance, 'GET', `/accounts/${accountId}/integrations/${positional[0]}`)).json()
    if (!integration.hosted || integration.inherited) {
      throw new CliError('integration-not-hosted', `${integration.name} is not hosted by this account's integration hosting.`)
    }
    fs.writeFileSync(PROJECT_FILE, `${JSON.stringify({ instanceUrl: instance, accountId, integrationId: integration.id }, null, 2)}\n`)
    return { result: { integrationId: integration.id, name: integration.name, accountId }, text: `Linked to ${integration.name}.` }
  },

  async pull({ positional, flags }) {
    const instance = resolveInstance(flags)
    const accountId = await resolveAccount(instance, flags)
    const directory = positional[1] || 'bundle'
    const response = await api(instance, 'GET', `/accounts/${accountId}/integrations/${positional[0]}/bundle`)
    const files = extractZip(Buffer.from(await response.arrayBuffer()), directory)
    return { result: { directory, files }, text: `Extracted ${files.length} files to ${directory}.` }
  },

  async delete({ positional, flags }) {
    if (!flags.yes) {
      throw new CliError('confirmation-required', 'Deleting an integration cannot be undone. Repeat with --yes.')
    }
    const instance = resolveInstance(flags)
    const accountId = await resolveAccount(instance, flags)
    await api(instance, 'DELETE', `/accounts/${accountId}/integrations/${positional[0]}`)
    return { result: { integrationId: positional[0], deleted: true }, text: `Deleted ${positional[0]}.` }
  },

  // The smallest check that fails if packaging breaks: zip twice, compare, extract, compare.
  async 'self-check'() {
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-integrations-source-'))
    const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-integrations-extracted-'))
    fs.mkdirSync(path.join(source, 'assets'))
    fs.writeFileSync(path.join(source, 'manifest.json'), '{"name":"Check","url":"./index.html"}')
    fs.writeFileSync(path.join(source, 'index.html'), '<h1>é</h1>'.repeat(200))
    fs.writeFileSync(path.join(source, 'assets', 'app.js'), 'run()')

    const first = createZip(source)
    if (!first.equals(createZip(source))) {
      throw new CliError('self-check-failed', 'The same files produced two different zips.')
    }
    const names = extractZip(first, extracted)
    for (const name of ['assets/app.js', 'index.html', 'manifest.json']) {
      if (!fs.readFileSync(path.join(source, name)).equals(fs.readFileSync(path.join(extracted, name)))) {
        throw new CliError('self-check-failed', `${name} did not survive zip and extract.`)
      }
    }
    return { result: { ok: true, files: names }, text: 'self-check passed' }
  },
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
