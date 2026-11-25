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

/**
 * Read the name and version from skill frontmatter.
 * @param {string} markdown
 * @returns {{name?: string, version?: string}}
 */
function readSkillMetadata(markdown) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? ''
  return {
    name: frontmatter.match(/^name: *["']?([a-z0-9-]+)["']? *\r?$/m)?.[1],
    version: frontmatter.match(/^[ \t]+version: *["']?([^"'\s]+)["']? *\r?$/m)?.[1],
  }
}

try {
  const skill = await readFile(new URL('../SKILL.md', import.meta.url), 'utf8')
  const { name, version: installed } = readSkillMetadata(skill)
  if (!name || !stableVersion.test(installed)) {
    throw new Error('Invalid installed skill metadata')
  }

  const api = `https://api.github.com/repos/${repository}`
  const options = {
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(4_000),
  }
  const response = await fetch(`${api}/git/matching-refs/tags/v`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) {
    throw new Error('Release tags unavailable')
  }
  const tags = await response.json()
  const versions = tags
    .map(({ ref }) => /^refs\/tags\/v(.+)$/.exec(ref)?.[1])
    .filter((version) => stableVersion.test(version))
  const release = versions.sort(compareVersions).at(-1)
  if (!release) {
    throw new Error('No stable release found')
  }

  const releasedSkill = await fetch(`${api}/contents/skills/${name}/SKILL.md?ref=v${release}`, {
    ...options,
    headers: { Accept: 'application/vnd.github.raw+json' },
  })
  if (!releasedSkill.ok) {
    throw new Error('Released skill unavailable')
  }
  const { name: releasedName, version: latest } = readSkillMetadata(await releasedSkill.text())
  if (releasedName !== name || !stableVersion.test(latest)) {
    throw new Error('Invalid released skill metadata')
  }

  if (compareVersions(installed, latest) >= 0) {
    console.log(`No newer stable release for ${name} ${installed}. The latest tagged release contains version ${latest}.`)
  } else {
    console.log([
      `${name} ${installed} is installed. Version ${latest} is available.`,
      `For the skills CLI, run npx skills update ${name}`,
      `For the GitHub CLI, run gh skill update ${name}`,
      `For a manual install, replace the skill folder with the copy at https://github.com/${repository}/tree/v${release}/skills/${name}`,
    ].join('\n'))
  }
} catch {
  console.log('FieldTwin skill update check unavailable.')
}
