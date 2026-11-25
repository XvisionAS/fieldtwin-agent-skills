#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const repository = 'XvisionAS/fieldtwin-agent-skills'
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/**
 * Compare two stable release versions numerically.
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareVersions(left, right) {
  const rightParts = right.split('.').map(BigInt)
  for (const [index, part] of left.split('.').map(BigInt).entries()) {
    if (part !== rightParts[index]) {
      return part > rightParts[index] ? 1 : -1
    }
  }
  return 0
}

try {
  const skill = await readFile(new URL('../SKILL.md', import.meta.url), 'utf8')
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? ''
  const name = frontmatter.match(/^name: *["']?([a-z0-9-]+)["']? *\r?$/m)?.[1]
  const installed = frontmatter.match(/^[ \t]+version: *["']?([^"'\s]+)["']? *\r?$/m)?.[1]
  if (!name || !stableVersion.test(installed)) {
    throw new Error('Invalid installed skill metadata')
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/git/matching-refs/tags/v`, {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(4_000),
  })
  if (!response.ok) {
    throw new Error('Release tags unavailable')
  }
  const tags = await response.json()
  const versions = tags
    .map(({ ref }) => /^refs\/tags\/v(.+)$/.exec(ref)?.[1])
    .filter((version) => stableVersion.test(version))
  const latest = versions.sort(compareVersions).at(-1)
  if (!latest) {
    throw new Error('No stable release found')
  }

  if (compareVersions(installed, latest) >= 0) {
    console.log(`No newer stable release for ${name} ${installed}. Latest stable release is ${latest}.`)
  } else {
    console.log([
      `${name} ${installed} is installed. Version ${latest} is available.`,
      `For the skills CLI, run npx skills update ${name}`,
      `For the GitHub CLI, run gh skill update ${name}`,
      `For a manual install, replace the skill folder with the copy at https://github.com/${repository}/tree/v${latest}/skills/${name}`,
    ].join('\n'))
  }
} catch {
  console.log('FieldTwin skill update check unavailable.')
}
