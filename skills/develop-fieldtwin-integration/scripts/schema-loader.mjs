/**
 * Keep API schema extraction independent from runtime data-layer initialisation.
 *
 * Some FieldTwin source modules declare a public schema or constant next to code that starts
 * runtime services. For those modules the loader serves a reduced module instead:
 *
 * - `KEPT_DECLARATIONS` copies the named declarations from the module's own source text, so the
 *   contract fields cannot drift from the source checkout.
 * - `REPLACEMENTS` supplies inert callbacks and placeholders that only have to exist while the
 *   schemas are constructed. They do not change the fields described by those schemas.
 *
 * Set `FIELDTWIN_SCHEMA_LOADER_TRACE=1` to print every intercepted module, which shows when an
 * entry is no longer imported and can be removed.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const KEPT_DECLARATIONS = [
  {
    suffix: '/routes/API.utils.middleware.js',
    prelude: `
      import Joi from 'joi'
      import pluralize from 'pluralize'
      import httpUrlSchema from './API.schemas.httpUrl.js'
    `,
    declarations: ['singular', 'manifestUrlBodySchema'],
    epilogue: 'export default { singular, asyncMiddleware: (handler) => handler }',
  },
  {
    suffix: '/routes/API.utils.documents.js',
    declarations: ['DOCUMENT_UPLOAD_FORM_FIELDS'],
  },
  {
    suffix: '/routes/API.utils.connectionCrossings.js',
    prelude: "import Joi from 'joi'",
    declarations: ['crossingsSchema'],
  },
  {
    suffix: '/routes/API.utils.schematics.js',
    prelude: "import Joi from 'joi'",
    declarations: ['schematicsSchema'],
  },
  {
    suffix: '/routes/API.v2.0/API.utils.v2.0.streamLogs.js',
    declarations: ['DEFAULT_LOGS_LIMIT'],
  },
  {
    suffix: '/libraries/generators/connection/generator.js',
    declarations: [
      'DESIGN_NONE',
      'DESIGN_RIZER_LAZYWAVE',
      'DESIGN_RIZER_CATENARY',
      'DESIGN_RIZER_TAUT',
      'DESIGN_JUMPER_HORIZONTAL_Z',
      'DESIGN_JUMPER_VERTICAL_M',
      'DESIGN_JUMPER_VERTICAL_N',
      'DESIGN_IMPORTED',
      'Designs',
    ],
    epilogue: `
      export const defaultParams = () => ({})
      export const generateConnection = () => ({})
      export const changeRadiusOfMbrPointWhilePreservingInputAndOutputDir = () => undefined
      export const getMbrIntersectionPoint = () => undefined
      export const isImported = (type) => type === DESIGN_IMPORTED
      export const isJumperHorizontal = () => false
      export const isJumperVertical = () => false
      export const isRiser = () => false
    `,
  },
]

const REPLACEMENTS = [
  {
    suffix: '/routes/API.utils.validation.js',
    source: `
      const identity = (value) => value
      const noop = () => undefined
      export default {
        vendorAttributeCustomValidator: identity,
        validateCountryName: identity,
        checkIfResourcesForRelationShipsExists: noop,
        validateVisibleVisualisationMapId: noop,
        validateSegmentsFitInParents: noop,
        SEGMENT_PARENT_ATTRIBUTE: {},
      }
    `,
  },
  {
    suffix: '/libraries/defaults/licenses.js',
    source: `
      export const LICENSE_TYPE_VIEW = 'view'
      export const LICENSE_TYPE_PRO = 'pro'
      export const LICENSE_TYPE_DESIGN = 'design'
      export const createDefaultLicenseConfiguration = () => ({})
    `,
  },
  {
    suffix: '/libraries/defaults/user-rights.js',
    source: `
      export const USER_ROLE_SYSTEM_VIEWER = '__System_Viewer__'
      export const DEFAULT_RIGHTS = { get: () => ({}) }
      export const USER_RIGHTS_TYPES = { get: () => [] }
      export const DEFAULT_ROLES = { get: () => [], find: () => undefined }
      export const SYSTEM_DEFAULT_ROLES = { get: () => [] }
    `,
  },
]

const OPENING = { '(': ')', '[': ']', '{': '}' }
const CLOSING = new Set(Object.values(OPENING))

/**
 * Return the index just past a quoted string or template literal that starts at `start`.
 *
 * @param {string} text
 * @param {number} start
 * @returns {number}
 */
function skipQuoted(text, start) {
  const quote = text[start]
  let index = start + 1
  while (index < text.length) {
    const character = text[index]
    if (character === '\\') {
      index += 2
      continue
    }
    if (quote === '`' && character === '$' && text[index + 1] === '{') {
      index = skipBalanced(text, index + 1)
      continue
    }
    if (character === quote) {
      return index + 1
    }
    index += 1
  }
  throw new Error('Unterminated string while extracting a declaration')
}

/**
 * Return the index just past the bracket group that opens at `start`.
 *
 * @param {string} text
 * @param {number} start
 * @returns {number}
 */
function skipBalanced(text, start) {
  let depth = 0
  let index = start
  while (index < text.length) {
    const next = skipTrivia(text, index)
    if (next !== index) {
      index = next
      continue
    }
    const character = text[index]
    if (OPENING[character]) {
      depth += 1
    } else if (CLOSING.has(character)) {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
    index += 1
  }
  throw new Error('Unbalanced brackets while extracting a declaration')
}

/**
 * Skip one comment, string, or template literal at `index`, or return `index` unchanged.
 *
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function skipTrivia(text, index) {
  const character = text[index]
  if (character === '/' && text[index + 1] === '/') {
    const end = text.indexOf('\n', index)
    return end === -1 ? text.length : end
  }
  if (character === '/' && text[index + 1] === '*') {
    const end = text.indexOf('*/', index + 2)
    if (end === -1) {
      throw new Error('Unterminated comment while extracting a declaration')
    }
    return end + 2
  }
  if (character === "'" || character === '"' || character === '`') {
    return skipQuoted(text, index)
  }
  return index
}

/**
 * Copy one top-level `const` declaration, including a leading `export`, from module source text.
 *
 * @param {string} text
 * @param {string} name
 * @param {string} moduleLabel
 * @returns {string}
 */
function extractDeclaration(text, name, moduleLabel) {
  const match = new RegExp(`^(?:export\\s+)?const\\s+${name}\\s*=`, 'm').exec(text)
  if (!match) {
    throw new Error(`Declaration ${name} was not found in ${moduleLabel}`)
  }
  let index = match.index + match[0].length
  let hasContent = false
  while (index < text.length) {
    const afterTrivia = skipTrivia(text, index)
    if (afterTrivia !== index) {
      hasContent = true
      index = afterTrivia
      continue
    }
    const character = text[index]
    if (OPENING[character]) {
      hasContent = true
      index = skipBalanced(text, index)
      continue
    }
    if (character === '\n' && hasContent) {
      // A statement continues on the next line only through a member chain or an operator.
      const rest = text.slice(index + 1).trimStart()
      if (!/^[.?:+\-*/%|&=<>,]/.test(rest)) {
        break
      }
    } else if (character === ';' && hasContent) {
      break
    } else if (!/\s/.test(character)) {
      hasContent = true
    }
    index += 1
  }
  return text.slice(match.index, index)
}

/**
 * Build the reduced module for one `KEPT_DECLARATIONS` entry.
 *
 * @param {string} url
 * @param {{suffix: string, prelude?: string, declarations: string[], epilogue?: string}} entry
 * @returns {Promise<string>}
 */
async function reducedModuleSource(url, entry) {
  const text = await readFile(fileURLToPath(url), 'utf8')
  const declarations = entry.declarations.map((name) =>
    extractDeclaration(text, name, entry.suffix)
  )
  return [entry.prelude || '', ...declarations, entry.epilogue || ''].join('\n')
}

/**
 * Report an intercepted module when tracing is enabled.
 *
 * @param {string} kind
 * @param {string} suffix
 * @returns {void}
 */
function trace(kind, suffix) {
  if (process.env.FIELDTWIN_SCHEMA_LOADER_TRACE) {
    process.stderr.write(`schema-loader ${kind}: ${suffix}\n`)
  }
}

export async function load(url, context, nextLoad) {
  const kept = KEPT_DECLARATIONS.find((entry) => url.endsWith(entry.suffix))
  if (kept) {
    trace('kept declarations', kept.suffix)
    return {
      format: 'module',
      shortCircuit: true,
      source: await reducedModuleSource(url, kept),
    }
  }

  const replacement = REPLACEMENTS.find((entry) => url.endsWith(entry.suffix))
  if (replacement) {
    trace('replacement', replacement.suffix)
    return { format: 'module', shortCircuit: true, source: replacement.source }
  }

  return nextLoad(url, context)
}
