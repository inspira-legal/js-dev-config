import fs from 'node:fs'
import path from 'node:path'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively collects all leaf key paths from a nested object.
 * @param {Record<string, unknown>} obj
 * @param {string[]} prefix
 * @returns {string[]}
 */
function collectKeys(obj, prefix = []) {
  const keys = []
  for (const key of Object.keys(obj)) {
    const currentPath = [...prefix, key]
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...collectKeys(obj[key], currentPath))
    } else {
      keys.push(currentPath.join('.'))
    }
  }
  return keys
}

/**
 * Converts a string between camelCase and snake_case.
 * 'documentVault' → 'document_vault'
 * 'document_vault' → 'documentVault'
 * @param {string} str
 * @returns {string}
 */
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
}

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * i18next plural suffixes that should be stripped when checking key usage.
 * e.g., 'documents_one' → 'documents', 'items_other' → 'items'
 */
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

/**
 * Strips i18next plural suffix from a key path's last segment.
 * 'namespace.documents_one' → 'namespace.documents'
 * 'namespace.key' → null (no suffix found)
 * @param {string} key
 * @returns {string | null}
 */
function stripPluralSuffix(key) {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      return key.slice(0, -suffix.length)
    }
  }
  return null
}

/**
 * Reads and parses a JSON file from disk.
 * @param {string} filePath
 * @returns {Record<string, unknown> | null}
 */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Lists locale directories inside a localesDir.
 * @param {string} localesDir - Absolute path
 * @returns {string[]} locale names (e.g., ['pt-BR', 'pt'])
 */
function listLocales(localesDir) {
  try {
    return fs
      .readdirSync(localesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * Lists JSON files inside a locale directory (non-recursive).
 * @param {string} localeDir - Absolute path to a locale folder
 * @returns {string[]} file names (e.g., ['common.json', 'error.json'])
 */
function listJsonFiles(localeDir) {
  try {
    return fs
      .readdirSync(localeDir)
      .filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
}

/**
 * Resolves the localesDir option to an absolute path relative to the linted file.
 * @param {string} localesDir - Relative path from project root (e.g. 'src/lib/i18n/locales')
 * @param {string} filename - The currently linted file's absolute path
 * @returns {string | null}
 */
function resolveLocalesDir(localesDir, filename) {
  // Walk up from the linted file to find the project root via package.json.
  let dir = path.dirname(filename)
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const resolved = path.join(dir, localesDir)
      return fs.existsSync(resolved) ? resolved : null
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Checks if a string looks like a technical identifier, not user-facing text.
 * @param {string} str
 * @returns {boolean}
 */
function isTechnicalString(str) {
  const trimmed = str.trim()
  if (trimmed.length === 0) return true
  if (trimmed.length <= 1) return true
  // Short all-caps acronyms (e.g. API, URL, HTML — 2-5 chars)
  if (/^[A-Z]{2,5}$/.test(trimmed)) return true
  // UPPER_CASE constants (require underscore to avoid matching repeated letters)
  if (/^[A-Z][A-Z0-9_]*_[A-Z0-9_]*$/.test(trimmed)) return true
  // camelCase identifiers (start lowercase with at least one uppercase)
  if (/^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(trimmed)) return true
  // PascalCase identifiers (e.g. MyComponent, FileReader — requires internal case transition)
  if (/^[A-Z][a-z]+[A-Z][a-zA-Z0-9]*$/.test(trimmed)) return true
  // Identifiers with special chars (_, $, .)
  if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(trimmed) && /[_$.]/.test(trimmed)) return true
  // kebab-case
  if (/^[a-z][a-z0-9-]*$/.test(trimmed)) return true
  // Numbers only
  if (/^[\d.,]+$/.test(trimmed)) return true
  // URLs, paths, protocols
  if (/^(https?:|mailto:|\/|\.\/|\.\.\/)/.test(trimmed)) return true
  // MIME types
  if (/^(application|text|image|audio|video)\//.test(trimmed)) return true
  // Color hex codes
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return true
  // CSS values (px, rem, em, %, vh, vw)
  if (/^\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|dvh|svh)$/.test(trimmed)) return true
  // Only special characters / punctuation / HTML entities
  if (/^[^a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF]+$/.test(trimmed)) return true
  // Template expression placeholders
  if (/^\{\{.*\}\}$/.test(trimmed)) return true
  // HTML entities
  if (/^&[a-z]+;$/i.test(trimmed)) return true
  // CSS !important
  if (trimmed === '!important') return true
  // Tailwind-like class strings (space-separated words with dashes, brackets, colons, slashes, or ! prefix)
  if (/^[a-z0-9[\]/:!@#._-]+(\s+[a-z0-9[\]/:!@#._-]+)*$/i.test(trimmed) && (trimmed.includes('-') || trimmed.includes('!'))) return true
  return false
}

const USER_FACING_JSX_ATTRS = new Set([
  'title',
  'placeholder',
  'label',
  'alt',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
])

const TECHNICAL_JSX_ATTRS = new Set([
  'className',
  'class',
  'id',
  'name',
  'type',
  'role',
  'htmlFor',
  'data-test',
  'data-testid',
  'href',
  'src',
  'action',
  'method',
  'target',
  'rel',
  'key',
  'style',
  'xmlns',
  'viewBox',
  'fill',
  'stroke',
  'd',
  'transform',
  'clipPath',
  'color',
])

// ─── Rule 1: no-literal-string ───────────────────────────────────────────────
//
// Runs on: TS/TSX source files (per-file, normal oxlint behavior)
// Detects untranslated literal strings in JSX and user-facing contexts.

const noLiteralString = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow untranslated literal strings in JSX and user-facing contexts',
    },
    messages: {
      noLiteralString:
        'Untranslated string "{{text}}". Use the t() function from i18next instead.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreAttributes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional JSX attribute names to ignore (technical, not user-facing)',
          },
          checkAttributes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional JSX attribute names that contain user-facing text and should be checked',
          },
          ignoreCallee: {
            type: 'array',
            items: { type: 'string' },
            description: 'Function names whose arguments should be ignored (regex patterns)',
          },
          ignorePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Regex patterns for strings to ignore',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {}
    const extraIgnoreAttrs = new Set(options.ignoreAttributes || [])
    const extraCheckAttrs = new Set(options.checkAttributes || [])
    const ignoreCalleePatterns = (options.ignoreCallee || []).map((p) => new RegExp(p))
    const ignoreStringPatterns = (options.ignorePatterns || []).map((p) => new RegExp(p))

    function shouldIgnoreString(value) {
      if (isTechnicalString(value)) return true
      return ignoreStringPatterns.some((re) => re.test(value))
    }

    function isIgnoredCallee(node) {
      if (!node) return false
      const name = getCalleeName(node)
      if (!name) return false
      if (['t', 'require', 'console'].some((fn) => name === fn || name.startsWith(fn + '.'))) {
        return true
      }
      return ignoreCalleePatterns.some((re) => re.test(name))
    }

    function getCalleeName(node) {
      if (node.type === 'Identifier') return node.name
      if (node.type === 'MemberExpression') {
        const obj = getCalleeName(node.object)
        const prop = node.property.type === 'Identifier' ? node.property.name : null
        return obj && prop ? `${obj}.${prop}` : null
      }
      return null
    }

    function isInsideIgnoredContext(node) {
      let current = node.parent

      while (current) {
        if (
          current.type === 'ImportDeclaration' ||
          current.type === 'ExportNamedDeclaration' ||
          current.type === 'ExportDefaultDeclaration'
        ) {
          return true
        }

        if (
          current.type === 'TSTypeAnnotation' ||
          current.type === 'TSLiteralType' ||
          current.type === 'TSTypeReference' ||
          current.type === 'TSUnionType' ||
          current.type === 'TSEnumMember'
        ) {
          return true
        }

        if (current.type === 'Property' && current.key === node) {
          return true
        }

        if (current.type === 'CallExpression' && isIgnoredCallee(current.callee)) {
          return true
        }

        if (current.type === 'TaggedTemplateExpression') {
          return true
        }

        if (current.type === 'SwitchCase' && current.test === node) {
          return true
        }

        if (
          current.type === 'VariableDeclarator' &&
          current.init === node &&
          current.id.type === 'Identifier' &&
          /^[A-Z][A-Z0-9_]+$/.test(current.id.name)
        ) {
          return true
        }

        node = current
        current = current.parent
      }

      return false
    }

    function reportLiteral(node, value) {
      if (shouldIgnoreString(value)) return
      if (isInsideIgnoredContext(node)) return

      const displayText = value.length > 40 ? value.slice(0, 40) + '...' : value
      context.report({
        node,
        messageId: 'noLiteralString',
        data: { text: displayText },
      })
    }

    function isTechnicalAttrContainer(containerNode) {
      const attr = containerNode?.parent
      if (attr?.type !== 'JSXAttribute') return false
      const attrName = attr.name?.name
      return TECHNICAL_JSX_ATTRS.has(attrName) || extraIgnoreAttrs.has(attrName)
    }

    return {
      JSXText(node) {
        const text = node.value.trim()
        if (text && !isTechnicalString(text)) {
          reportLiteral(node, text)
        }
      },

      Literal(node) {
        if (typeof node.value !== 'string') return
        const value = node.value.trim()
        if (!value) return

        const parent = node.parent

        if (parent?.type === 'JSXAttribute') {
          const attrName = parent.name?.name
          if (TECHNICAL_JSX_ATTRS.has(attrName) || extraIgnoreAttrs.has(attrName)) return
          if (USER_FACING_JSX_ATTRS.has(attrName) || extraCheckAttrs.has(attrName)) {
            reportLiteral(node, value)
            return
          }
          return
        }

        if (parent?.type === 'JSXExpressionContainer') {
          if (isTechnicalAttrContainer(parent)) return
          reportLiteral(node, value)
          return
        }

        if (parent?.type === 'BinaryExpression' && parent.operator === '+') {
          let current = parent
          while (current.parent) {
            if (current.parent.type === 'JSXExpressionContainer') {
              if (isTechnicalAttrContainer(current.parent)) return
              reportLiteral(node, value)
              return
            }
            current = current.parent
          }
        }
      },

      TemplateLiteral(node) {
        const parent = node.parent
        if (parent?.type === 'TaggedTemplateExpression') return

        const hasUserFacingText = node.quasis.some((quasi) => {
          const text = quasi.value.raw.trim()
          return text && !isTechnicalString(text)
        })

        if (!hasUserFacingText) return

        let current = node.parent
        while (current) {
          if (current.type === 'JSXExpressionContainer') {
            if (isTechnicalAttrContainer(current)) return
            const fullText = node.quasis.map((q) => q.value.raw).join('...')
            reportLiteral(node, fullText)
            return
          }
          if (current.type === 'CallExpression' && isIgnoredCallee(current.callee)) return
          current = current.parent
        }
      },
    }
  },
}

// ─── Rule 2: enforce-keys-sync ───────────────────────────────────────────────
//
// Runs on: TS/TSX source files (per-file), but executes ONCE per lint run.
// Reads all locale JSON files from disk using the `localesDir` option.
// Compares non-base locales against the base locale and reports missing/extra keys.

/** @type {Set<string>} tracks which localesDir paths have already been checked */
const syncCheckedDirs = new Set()

const enforceKeysSync = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure translation keys are synchronized across all locales',
    },
    messages: {
      missingKey:
        "[{{locale}}/{{file}}] key '{{key}}' exists in {{baseLocale}} but is missing",
      unexpectedKey:
        "[{{locale}}/{{file}}] key '{{key}}' exists but not in {{baseLocale}} — remove it or add to {{baseLocale}}",
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseLocale: {
            type: 'string',
            description: 'The base locale to compare against (e.g. "pt-BR")',
          },
          localesDir: {
            type: 'string',
            description:
              'Relative path from project root to the locales directory (e.g. "src/lib/i18n/locales")',
          },
        },
        required: ['baseLocale', 'localesDir'],
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0]
    if (!options) return {}

    const { baseLocale, localesDir } = options

    // Resolve to absolute path from the linted file
    const absoluteLocalesDir = resolveLocalesDir(localesDir, context.filename)
    if (!absoluteLocalesDir) return {}

    // Only run once per localesDir per lint invocation
    if (syncCheckedDirs.has(absoluteLocalesDir)) return {}
    syncCheckedDirs.add(absoluteLocalesDir)

    return {
      Program(node) {
        const locales = listLocales(absoluteLocalesDir)
        const otherLocales = locales.filter((l) => l !== baseLocale)
        const baseDir = path.join(absoluteLocalesDir, baseLocale)
        const baseFiles = listJsonFiles(baseDir)

        for (const file of baseFiles) {
          const baseContent = readJson(path.join(baseDir, file))
          if (!baseContent) continue

          const baseKeys = new Set(collectKeys(baseContent))
          const namespace = file.replace(/\.json$/, '')

          for (const locale of otherLocales) {
            const localeContent = readJson(path.join(absoluteLocalesDir, locale, file))

            if (!localeContent) {
              // Entire file missing in this locale
              for (const key of baseKeys) {
                context.report({
                  node,
                  messageId: 'missingKey',
                  data: { key, locale, file, baseLocale },
                })
              }
              continue
            }

            const localeKeys = new Set(collectKeys(localeContent))

            for (const key of baseKeys) {
              if (!localeKeys.has(key)) {
                context.report({
                  node,
                  messageId: 'missingKey',
                  data: { key: `${namespace}.${key}`, locale, file, baseLocale },
                })
              }
            }

            for (const key of localeKeys) {
              if (!baseKeys.has(key)) {
                context.report({
                  node,
                  messageId: 'unexpectedKey',
                  data: { key: `${namespace}.${key}`, locale, file, baseLocale },
                })
              }
            }
          }
        }
      },
    }
  },
}

// ─── Rule 3: no-unused-keys ──────────────────────────────────────────────────
//
// Runs on: TS/TSX source files (per-file), but executes ONCE per lint run.
// Reads base locale JSON files from disk, scans all source files for t() calls,
// and reports keys that are never referenced.

/** @type {Set<string>} tracks which localesDir paths have already been checked */
const unusedCheckedDirs = new Set()

/**
 * Scans all source files for t() calls and extracts used translation keys.
 * @param {string} sourceDir - Absolute path to the source directory
 * @returns {Set<string>}
 */
function scanSourceForUsedKeys(sourceDir) {
  const usedKeys = new Set()

  // Patterns that extract translation keys from source:
  //   t('namespace.key')  t("namespace.key")  t(`namespace.key`)
  //   i18n.t('namespace.key')
  const tCallRegex = /\.t\(\s*[`'"]([\w.]+)[`'"]/g
  const tCallRegex2 = /(?:^|[^.\w])t\(\s*[`'"]([\w.]+)[`'"]/g
  const transRegex = /i18nKey\s*=\s*[`'"]([\w.]+)[`'"]/g

  // Patterns for template literals with dynamic segments:
  //   t(`namespace.${var}`)  t(`namespace.key.${var}.suffix`)
  //   .t(`namespace.${var}`)
  // Extracts the static prefix before the first ${...}
  const tTemplateDynamic = /\.t\(\s*`([\w.]+)\.\$\{/g
  const tTemplateDynamic2 = /(?:^|[^.\w])t\(\s*`([\w.]+)\.\$\{/g

  function scanDir(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'generated', 'build', 'dist'].includes(entry.name)) continue
        scanDir(fullPath)
        continue
      }

      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue

      let content
      try {
        content = fs.readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }

      for (const regex of [tCallRegex, tCallRegex2, transRegex, tTemplateDynamic, tTemplateDynamic2]) {
        regex.lastIndex = 0
        let match
        while ((match = regex.exec(content)) !== null) {
          const key = match[1]
          usedKeys.add(key)
          // Also add the snake_case/camelCase variant of the namespace prefix
          // so t('documentVault.X') matches file namespace 'document_vault'
          const dotIdx = key.indexOf('.')
          if (dotIdx > 0) {
            const ns = key.slice(0, dotIdx)
            const rest = key.slice(dotIdx)
            usedKeys.add(camelToSnake(ns) + rest)
            usedKeys.add(snakeToCamel(ns) + rest)
          } else {
            usedKeys.add(camelToSnake(key))
            usedKeys.add(snakeToCamel(key))
          }
        }
      }
    }
  }

  scanDir(sourceDir)
  return usedKeys
}

const noUnusedKeys = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Detect translation keys in locale files that are not used in source code',
    },
    messages: {
      unusedKey:
        "[{{namespace}}] key '{{key}}' is not used in source code. Consider removing it.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseLocale: {
            type: 'string',
            description: 'The base locale to check (e.g. "pt-BR")',
          },
          localesDir: {
            type: 'string',
            description:
              'Relative path from project root to the locales directory (e.g. "src/lib/i18n/locales")',
          },
          sourceDir: {
            type: 'string',
            description:
              'Relative path from project root to the source directory to scan (e.g. "src")',
          },
          ignoreKeys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Key patterns to ignore (regex strings)',
          },
        },
        required: ['baseLocale', 'localesDir', 'sourceDir'],
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0]
    if (!options) return {}

    const { baseLocale, localesDir, sourceDir } = options

    const absoluteLocalesDir = resolveLocalesDir(localesDir, context.filename)
    if (!absoluteLocalesDir) return {}

    // Only run once per localesDir per lint invocation
    if (unusedCheckedDirs.has(absoluteLocalesDir)) return {}
    unusedCheckedDirs.add(absoluteLocalesDir)

    return {
      Program(node) {
        // Resolve sourceDir the same way as localesDir
        const resolvedSourceDir = resolveLocalesDir(sourceDir, context.filename)
        if (!resolvedSourceDir) return

        const usedKeys = scanSourceForUsedKeys(resolvedSourceDir)
        const ignorePatterns = (options.ignoreKeys || []).map((p) => new RegExp(p))

        const baseDir = path.join(absoluteLocalesDir, baseLocale)
        const jsonFiles = listJsonFiles(baseDir)

        for (const file of jsonFiles) {
          const content = readJson(path.join(baseDir, file))
          if (!content) continue

          const namespace = file.replace(/\.json$/, '')
          const fileKeys = collectKeys(content)

          for (const key of fileKeys) {
            const fullKey = `${namespace}.${key}`

            if (ignorePatterns.some((re) => re.test(fullKey) || re.test(key))) continue

            // Check direct match, plural base form, or partial prefix match
            const baseKey = stripPluralSuffix(fullKey)
            if (!usedKeys.has(fullKey) && !(baseKey && usedKeys.has(baseKey))) {
              const keyParts = fullKey.split('.')
              const hasPartialMatch = keyParts.some((_, i) => {
                const partial = keyParts.slice(0, i + 1).join('.')
                return usedKeys.has(partial)
              })

              if (!hasPartialMatch) {
                context.report({
                  node,
                  messageId: 'unusedKey',
                  data: { key: fullKey, namespace },
                })
              }
            }
          }
        }
      },
    }
  },
}

// ─── Plugin Export ────────────────────────────────────────────────────────────

const plugin = {
  meta: {
    name: '@inspira-legal/i18n',
    version: '1.0.0',
  },
  rules: {
    'no-literal-string': noLiteralString,
    'enforce-keys-sync': enforceKeysSync,
    'no-unused-keys': noUnusedKeys,
  },
}

export function _resetForTesting() {
  syncCheckedDirs.clear()
  unusedCheckedDirs.clear()
}

export default plugin
