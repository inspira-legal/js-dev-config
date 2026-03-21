import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const src = resolve(root, 'src')

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(resolve(src, relativePath), 'utf-8'))
}

describe('.oxlintrc.json', () => {
  const config = readJson('.oxlintrc.json')

  it('has required plugins', () => {
    expect(config.plugins).toContain('typescript')
    expect(config.plugins).toContain('react')
    expect(config.plugins).toContain('jsx-a11y')
    expect(config.plugins).toContain('import')
  })

  it('has correctness category set to error', () => {
    expect(config.categories.correctness).toBe('error')
  })

  it('disables no-explicit-any', () => {
    expect(config.rules['@typescript-eslint/no-explicit-any']).toBe('off')
  })

  it('enforces consistent-type-imports', () => {
    const rule = config.rules['@typescript-eslint/consistent-type-imports']
    expect(rule[0]).toBe('error')
    expect(rule[1].prefer).toBe('type-imports')
  })

  it('enforces react hooks rules', () => {
    expect(config.rules['react-hooks/rules-of-hooks']).toBe('error')
    expect(config.rules['react-hooks/exhaustive-deps']).toBe('error')
  })

  it('disables prop-types and react-in-jsx-scope', () => {
    expect(config.rules['react/prop-types']).toBe('off')
    expect(config.rules['react/react-in-jsx-scope']).toBe('off')
  })
})

describe('.oxfmtrc.json', () => {
  const config = readJson('.oxfmtrc.json')

  it('matches Prettier settings', () => {
    expect(config.useTabs).toBe(false)
    expect(config.tabWidth).toBe(2)
    expect(config.semi).toBe(false)
    expect(config.singleQuote).toBe(true)
    expect(config.bracketSpacing).toBe(true)
    expect(config.printWidth).toBe(100)
    expect(config.arrowParens).toBe('always')
    expect(config.trailingComma).toBe('all')
    expect(config.bracketSameLine).toBe(false)
    expect(config.jsxSingleQuote).toBe(true)
    expect(config.endOfLine).toBe('lf')
  })
})

describe('tsconfig.json', () => {
  const config = readJson('tsconfig.json')

  it('has strict mode enabled', () => {
    expect(config.compilerOptions.strict).toBe(true)
  })

  it('has isolatedModules enabled', () => {
    expect(config.compilerOptions.isolatedModules).toBe(true)
  })

  it('has skipLibCheck enabled', () => {
    expect(config.compilerOptions.skipLibCheck).toBe(true)
  })
})

describe('i18n plugin', () => {
  it('exists', () => {
    expect(existsSync(resolve(root, 'plugins/i18n.mjs'))).toBe(true)
  })

  it('exports a valid plugin with 3 rules', async () => {
    const plugin = await import(resolve(root, 'plugins/i18n.mjs'))
    const defaultExport = plugin.default

    expect(defaultExport.meta.name).toBe('@inspira-legal/i18n')
    expect(defaultExport.rules).toHaveProperty('no-literal-string')
    expect(defaultExport.rules).toHaveProperty('enforce-keys-sync')
    expect(defaultExport.rules).toHaveProperty('no-unused-keys')
  })

  it('each rule has meta and create function', async () => {
    const plugin = await import(resolve(root, 'plugins/i18n.mjs'))
    const rules = plugin.default.rules

    for (const [name, rule] of Object.entries(rules) as [string, any][]) {
      expect(rule.meta, `${name} should have meta`).toBeDefined()
      expect(rule.meta.type, `${name} should have meta.type`).toBeDefined()
      expect(rule.meta.messages, `${name} should have meta.messages`).toBeDefined()
      expect(typeof rule.create, `${name} should have create function`).toBe('function')
    }
  })
})

describe('package.json', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

  it('has correct package name', () => {
    expect(pkg.name).toBe('@inspira-legal/dev-config')
  })

  it('publishes src/ directory', () => {
    expect(pkg.files).toContain('src/')
  })

  it('publishes to GitHub Packages', () => {
    expect(pkg.publishConfig.registry).toBe('https://npm.pkg.github.com/')
  })
})
