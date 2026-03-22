import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const pluginPath = resolve(import.meta.dirname, '..', 'plugins', 'i18n.mjs')

let _plugin: any
let _resetForTesting: () => void

async function loadPlugin() {
  if (!_plugin) {
    const mod = await import(pluginPath)
    _plugin = mod.default
    _resetForTesting = mod._resetForTesting
  }
  _resetForTesting()
  return _plugin
}

// ─── Mock Context Factory ────────────────────────────────────────────────────

interface Report {
  messageId: string
  data?: Record<string, string>
}

function createMockContext(overrides: {
  options?: any[]
  filename?: string
} = {}) {
  const reports: Report[] = []

  return {
    reports,
    context: {
      options: overrides.options || [],
      filename: overrides.filename || '/project/src/app.tsx',
      sourceCode: { text: '' },
      report(args: Report) {
        reports.push({ messageId: args.messageId, data: args.data })
      },
    },
  }
}

// ─── Mock AST Node Factories ─────────────────────────────────────────────────

function makeNode(type: string, props: Record<string, any> = {}) {
  return { type, parent: null, ...props }
}

function jsxText(value: string, parent: any = null) {
  return { type: 'JSXText', value, parent }
}

function literal(value: string, parent: any = null) {
  return { type: 'Literal', value, parent }
}

function jsxAttr(name: string, child: any) {
  const attr = makeNode('JSXAttribute', { name: { name } })
  child.parent = attr
  return child
}

function jsxExprContainer(child: any) {
  const container = makeNode('JSXExpressionContainer')
  child.parent = container
  return child
}

function callExpr(calleeName: string, child: any) {
  const callee = makeNode('Identifier', { name: calleeName })
  const call = makeNode('CallExpression', { callee })
  child.parent = call
  return child
}

function memberCallExpr(obj: string, prop: string, child: any) {
  const callee = makeNode('MemberExpression', {
    object: makeNode('Identifier', { name: obj }),
    property: makeNode('Identifier', { name: prop }),
  })
  const call = makeNode('CallExpression', { callee })
  child.parent = call
  return child
}

function importDecl(child: any) {
  const decl = makeNode('ImportDeclaration')
  child.parent = decl
  return child
}

function tsTypeAnnotation(child: any) {
  const ann = makeNode('TSTypeAnnotation')
  child.parent = ann
  return child
}

function tsEnumMember(child: any) {
  const mem = makeNode('TSEnumMember')
  child.parent = mem
  return child
}

function propertyKey(child: any) {
  const prop = makeNode('Property', { key: child })
  child.parent = prop
  return child
}

function switchCaseTest(child: any) {
  const sc = makeNode('SwitchCase', { test: child })
  child.parent = sc
  return child
}

function upperCaseVar(varName: string, child: any) {
  const id = makeNode('Identifier', { name: varName })
  const decl = makeNode('VariableDeclarator', { id, init: child })
  child.parent = decl
  return child
}

function taggedTemplate(child: any) {
  const tagged = makeNode('TaggedTemplateExpression')
  child.parent = tagged
  return child
}

function binaryInJSX(child: any) {
  const binary = makeNode('BinaryExpression', { operator: '+' })
  child.parent = binary
  const container = makeNode('JSXExpressionContainer')
  binary.parent = container
  return child
}

function jsxExprContainerInAttr(attrName: string, child: any) {
  const container = makeNode('JSXExpressionContainer')
  child.parent = container
  const attr = makeNode('JSXAttribute', { name: { name: attrName } })
  container.parent = attr
  return child
}

function binaryInJSXAttr(attrName: string, child: any) {
  const binary = makeNode('BinaryExpression', { operator: '+' })
  child.parent = binary
  const container = makeNode('JSXExpressionContainer')
  binary.parent = container
  const attr = makeNode('JSXAttribute', { name: { name: attrName } })
  container.parent = attr
  return child
}

function templateLiteralInJSXAttr(attrName: string, quasis: string[]) {
  const node = makeNode('TemplateLiteral', {
    quasis: quasis.map((raw) => ({ value: { raw } })),
  })
  const container = makeNode('JSXExpressionContainer')
  node.parent = container
  const attr = makeNode('JSXAttribute', { name: { name: attrName } })
  container.parent = attr
  return node
}

function templateLiteralInJSX(quasis: string[]) {
  const node = makeNode('TemplateLiteral', {
    quasis: quasis.map((raw) => ({ value: { raw } })),
  })
  const container = makeNode('JSXExpressionContainer')
  node.parent = container
  return node
}

// ─── no-literal-string ───────────────────────────────────────────────────────

describe('no-literal-string', () => {
  let rule: any

  beforeEach(async () => {
    const plugin = await loadPlugin()
    rule = plugin.rules['no-literal-string']
  })

  describe('JSXText', () => {
    it('reports user-facing text in JSX', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('Hello World'))
      expect(reports).toHaveLength(1)
      expect(reports[0].messageId).toBe('noLiteralString')
    })

    it('reports Portuguese text', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('Salvar decisão'))
      expect(reports).toHaveLength(1)
    })

    it('reports text with accents', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('Não encontrado'))
      expect(reports).toHaveLength(1)
    })

    it('ignores whitespace-only text', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('   \n  '))
      expect(reports).toHaveLength(0)
    })

    it('ignores single characters', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('x'))
      expect(reports).toHaveLength(0)
    })

    it('ignores punctuation-only strings', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('...'))
      expect(reports).toHaveLength(0)
    })
  })

  describe('Literal in JSX attributes', () => {
    it('reports user-facing attributes (title)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const node = jsxAttr('title', literal('Click me'))
      visitor.Literal(node)
      expect(reports).toHaveLength(1)
    })

    it('reports user-facing attributes (placeholder)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('placeholder', literal('Enter your name')))
      expect(reports).toHaveLength(1)
    })

    it('reports user-facing attributes (alt)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('alt', literal('Profile picture')))
      expect(reports).toHaveLength(1)
    })

    it('reports aria-label', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('aria-label', literal('Close dialog')))
      expect(reports).toHaveLength(1)
    })

    it('reports aria-description', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('aria-description', literal('This section contains results')))
      expect(reports).toHaveLength(1)
    })

    it('ignores className attribute', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('className', literal('flex items-center')))
      expect(reports).toHaveLength(0)
    })

    it('ignores data-test attribute', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('data-test', literal('submit-button')))
      expect(reports).toHaveLength(0)
    })

    it('ignores data-testid attribute', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('data-testid', literal('my-component')))
      expect(reports).toHaveLength(0)
    })

    it('ignores href attribute', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('href', literal('/dashboard')))
      expect(reports).toHaveLength(0)
    })

    it('ignores src attribute', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('src', literal('/images/logo.png')))
      expect(reports).toHaveLength(0)
    })

    it('ignores type attribute', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('type', literal('submit')))
      expect(reports).toHaveLength(0)
    })

    it('ignores role attribute', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('role', literal('button')))
      expect(reports).toHaveLength(0)
    })

    it('ignores SVG attributes (viewBox, d, fill, stroke, transform)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      for (const attr of ['viewBox', 'd', 'fill', 'stroke', 'transform', 'clipPath']) {
        visitor.Literal(jsxAttr(attr, literal('some-value')))
      }
      expect(reports).toHaveLength(0)
    })

    it('ignores unknown attributes (not user-facing)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('someCustomProp', literal('Hello World')))
      expect(reports).toHaveLength(0)
    })

    it('respects ignoreAttributes option', () => {
      const { context, reports } = createMockContext({
        options: [{ ignoreAttributes: ['tooltip'] }],
      })
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('tooltip', literal('Help text')))
      expect(reports).toHaveLength(0)
    })

    it('reports literals in userFacingAttributes custom attrs', () => {
      const { context, reports } = createMockContext({
        options: [{ userFacingAttributes: ['tooltip', 'message'] }],
      })
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('tooltip', literal('Help text')))
      expect(reports).toHaveLength(1)
    })

    it('does not report non-user-facing custom attrs', () => {
      const { context, reports } = createMockContext({
        options: [{ userFacingAttributes: ['tooltip'] }],
      })
      const visitor = rule.create(context)
      // 'message' is not in userFacingAttributes, so it should be ignored
      visitor.Literal(jsxAttr('message', literal('Hello World')))
      expect(reports).toHaveLength(0)
    })
  })

  describe('Literal in JSX expression container', () => {
    it('reports string literals in JSX expressions', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('Hello World')))
      expect(reports).toHaveLength(1)
    })

    it('ignores technical strings in JSX expressions', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('camelCase')))
      expect(reports).toHaveLength(0)
    })
  })

  describe('class/className expression containers', () => {
    it('ignores literal in className={...}', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainerInAttr('className', literal('flex items-center gap-2')))
      expect(reports).toHaveLength(0)
    })

    it('ignores literal in class={...}', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainerInAttr('class', literal('flex items-center gap-2')))
      expect(reports).toHaveLength(0)
    })

    it('ignores binary expression in className={... + ...}', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(binaryInJSXAttr('className', literal('flex items-center')))
      expect(reports).toHaveLength(0)
    })

    it('ignores binary expression in class={... + ...}', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(binaryInJSXAttr('class', literal('hidden md:block')))
      expect(reports).toHaveLength(0)
    })

    it('ignores template literal in className={`...`}', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const node = templateLiteralInJSXAttr('className', ['flex ', ' items-center'])
      visitor.TemplateLiteral(node)
      expect(reports).toHaveLength(0)
    })

    it('ignores template literal in class={`...`}', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const node = templateLiteralInJSXAttr('class', ['container ', ' mx-auto'])
      visitor.TemplateLiteral(node)
      expect(reports).toHaveLength(0)
    })

    it('still reports literal in title={...}', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainerInAttr('title', literal('Hello World')))
      expect(reports).toHaveLength(1)
    })

    it('still reports template literal in non-class expression', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const node = templateLiteralInJSX(['Hello ', ' World'])
      visitor.TemplateLiteral(node)
      expect(reports).toHaveLength(1)
    })

    it('ignores other technical JSX attrs in expression container (id, style, etc.)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainerInAttr('id', literal('my-section')))
      expect(reports).toHaveLength(0)
    })
  })

  describe('Literal in binary expression inside JSX', () => {
    it('reports string concatenation in JSX', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(binaryInJSX(literal('Hello ')))
      expect(reports).toHaveLength(1)
    })
  })

  describe('technical string detection', () => {
    it('ignores UPPER_CASE constants', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('API_KEY'))
      expect(reports).toHaveLength(0)
    })

    it('ignores short all-caps acronyms (API, URL, HTML)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      for (const acronym of ['API', 'URL', 'HTML', 'CSS', 'JSON', 'ID']) {
        visitor.JSXText(jsxText(acronym))
      }
      expect(reports).toHaveLength(0)
    })

    it('reports long all-caps strings (6+ chars, no underscore)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('ABCDEF'))
      expect(reports).toHaveLength(1)
    })

    it('ignores camelCase identifiers', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('myVariable')))
      expect(reports).toHaveLength(0)
    })

    it('ignores kebab-case identifiers', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('my-component')))
      expect(reports).toHaveLength(0)
    })

    it('ignores URLs', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('https://example.com')))
      expect(reports).toHaveLength(0)
    })

    it('ignores relative paths', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('./components/Button')))
      expect(reports).toHaveLength(0)
    })

    it('ignores MIME types', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('application/json')))
      expect(reports).toHaveLength(0)
    })

    it('ignores hex colors', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('#FF5733')))
      expect(reports).toHaveLength(0)
    })

    it('ignores CSS values', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      for (const v of ['16px', '1.5rem', '100%', '50vh', '2em']) {
        visitor.Literal(jsxExprContainer(literal(v)))
      }
      expect(reports).toHaveLength(0)
    })

    it('ignores numbers', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('1,234.56')))
      expect(reports).toHaveLength(0)
    })

    it('ignores HTML entities', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('&nbsp;'))
      expect(reports).toHaveLength(0)
    })

    it('ignores !important', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('!important')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind class strings', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const tailwindStrings = [
        'flex items-center gap-2',
        'text-[#2D3AA1]',
        'bg-neutral-3 flex flex-1 flex-col',
        'hover:bg-blue-500',
        'sm:grid-cols-2 md:grid-cols-3',
        'w-full max-w-[400px]',
        'line-clamp-[3]',
      ]
      for (const tw of tailwindStrings) {
        visitor.Literal(jsxExprContainer(literal(tw)))
      }
      expect(reports).toHaveLength(0)
    })

    it('ignores template placeholders', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('{{name}}')))
      expect(reports).toHaveLength(0)
    })
  })

  describe('ignored contexts', () => {
    it('ignores strings inside import declarations', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(importDecl(literal('Hello World')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings inside TypeScript type annotations', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(tsTypeAnnotation(literal('Hello World')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings inside enum members', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(tsEnumMember(literal('Hello World')))
      expect(reports).toHaveLength(0)
    })

    it('ignores object property keys', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(propertyKey(literal('Hello World')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings inside t() calls', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(callExpr('t', literal('common.save')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings inside i18n.t() calls', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(memberCallExpr('i18n', 't', literal('common.save')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings inside console.log()', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(memberCallExpr('console', 'log', literal('Debug message here')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings inside console.error()', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(memberCallExpr('console', 'error', literal('Error occurred here')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings inside require()', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(callExpr('require', literal('some module path')))
      expect(reports).toHaveLength(0)
    })

    it('ignores switch case test values', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(switchCaseTest(literal('Hello World')))
      expect(reports).toHaveLength(0)
    })

    it('ignores UPPER_CASE variable assignments', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(upperCaseVar('API_URL', literal('Hello World')))
      expect(reports).toHaveLength(0)
    })

    it('does NOT ignore lowercase variable assignments', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const node = literal('Hello World')
      const id = makeNode('Identifier', { name: 'myVar' })
      const decl = makeNode('VariableDeclarator', { id, init: node })
      node.parent = decl
      // This goes through Literal but parent is VariableDeclarator (not JSXAttribute or JSXExpressionContainer)
      // so it won't be reported (no JSX context)
      visitor.Literal(node)
      expect(reports).toHaveLength(0)
    })
  })

  describe('ignoreCallee option', () => {
    it('ignores custom callee patterns', () => {
      const { context, reports } = createMockContext({
        options: [{ ignoreCallee: ['^track'] }],
      })
      const visitor = rule.create(context)
      visitor.Literal(callExpr('trackEvent', literal('User clicked submit button')))
      expect(reports).toHaveLength(0)
    })
  })

  describe('ignorePatterns option', () => {
    it('ignores strings matching custom patterns', () => {
      const { context, reports } = createMockContext({
        options: [{ ignorePatterns: ['^Error:'] }],
      })
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('Error: something failed')))
      expect(reports).toHaveLength(0)
    })

    it('still reports strings not matching pattern', () => {
      const { context, reports } = createMockContext({
        options: [{ ignorePatterns: ['^Error:'] }],
      })
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('Something failed')))
      expect(reports).toHaveLength(1)
    })
  })

  describe('TemplateLiteral', () => {
    it('ignores tagged templates (css, html)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const tl = makeNode('TemplateLiteral', {
        quasis: [{ value: { raw: 'Hello World' } }],
      })
      taggedTemplate(tl)
      visitor.TemplateLiteral(tl)
      expect(reports).toHaveLength(0)
    })
  })

  describe('display text truncation', () => {
    it('truncates long strings in report messages', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const longText = 'A'.repeat(60)
      visitor.JSXText(jsxText(longText))
      expect(reports).toHaveLength(1)
      expect(reports[0].data!.text).toHaveLength(43) // 40 + '...'
      expect(reports[0].data!.text.endsWith('...')).toBe(true)
    })
  })

  // ─── Real-world edge cases found in app ──────────────────────────────────

  describe('real-world false positives (should NOT report)', () => {
    it('ignores Tailwind arbitrary color: text-[#2D3AA1]', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('text-[#2D3AA1]')))
      expect(reports).toHaveLength(0)
    })

    it('ignores CSS !important', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('!important')))
      expect(reports).toHaveLength(0)
    })

    it('ignores &nbsp; HTML entity', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('&nbsp;'))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind: flex w-full flex-col gap-4', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('flex w-full flex-col gap-4')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind: bg-neutral-3 flex flex-1 flex-col self-stretch', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('bg-neutral-3 flex flex-1 flex-col self-stretch')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind: line-clamp-[3]', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('line-clamp-[3]')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind: hover:bg-blue-500 sm:grid-cols-2', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('hover:bg-blue-500 sm:grid-cols-2')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind: w-full max-w-[400px]', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('w-full max-w-[400px]')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind with dark mode: dark:bg-gray-900 dark:text-white', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('dark:bg-gray-900 dark:text-white')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind with negative values: -translate-x-1/2', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('-translate-x-1/2')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind with !important modifier: !flex !hidden', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('!flex !hidden')))
      expect(reports).toHaveLength(0)
    })

    it('ignores Tailwind: flex w-full flex-col items-center pt-8', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('flex w-full flex-col items-center pt-8')))
      expect(reports).toHaveLength(0)
    })
  })

  describe('edge cases from eslint-plugin-i18next valid fixtures', () => {
    it('ignores string method calls: indexOf, includes, startsWith', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      // These are in call expressions, not JSX context — should not report
      visitor.Literal(callExpr('indexOf', literal('hello')))
      visitor.Literal(callExpr('includes', literal('world')))
      visitor.Literal(callExpr('startsWith', literal('prefix')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings in DOM API calls', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(memberCallExpr('document', 'addEventListener', literal('click')))
      visitor.Literal(memberCallExpr('document', 'getElementById', literal('root')))
      visitor.Literal(memberCallExpr('window', 'postMessage', literal('hello')))
      expect(reports).toHaveLength(0)
    })

    it('ignores emoji-only strings', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('🌼🌺🌸')))
      expect(reports).toHaveLength(0)
    })

    it('reports emoji + text (user-facing)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('🌼 Hello World'))
      expect(reports).toHaveLength(1)
    })

    it('ignores displayName assignments', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      // Component.displayName = 'MyComponent' — technical identifier
      visitor.Literal(jsxExprContainer(literal('MyComponent')))
      expect(reports).toHaveLength(0) // PascalCase = technical
    })

    it('ignores JSX aria-labelledby (technical reference, not text)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      // aria-labelledby references an ID, not user-facing text
      visitor.Literal(jsxAttr('aria-labelledby', literal('header-title')))
      expect(reports).toHaveLength(0) // Unknown attr = not reported
    })

    it('ignores object computed property keys', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(propertyKey(literal('some key name')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings in store.dispatch / store.commit', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(memberCallExpr('store', 'dispatch', literal('SET_USER')))
      visitor.Literal(memberCallExpr('store', 'commit', literal('UPDATE_STATE')))
      expect(reports).toHaveLength(0)
    })

    it('reports Japanese text in JSX (non-ASCII user-facing)', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('こんにちは世界'))
      expect(reports).toHaveLength(1)
    })

    it('reports Chinese text in JSX', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('你好世界'))
      expect(reports).toHaveLength(1)
    })

    it('reports Korean text in JSX', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('안녕하세요'))
      expect(reports).toHaveLength(1)
    })

    it('ignores i18next function variants: i18n(), i18next.t()', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(memberCallExpr('i18next', 't', literal('some user text here')))
      expect(reports).toHaveLength(0)
    })

    it('ignores strings in export declarations', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const node = literal('Hello World')
      const decl = makeNode('ExportNamedDeclaration')
      node.parent = decl
      visitor.Literal(node)
      expect(reports).toHaveLength(0)
    })

    it('ignores strings in export default', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      const node = literal('Hello World')
      const decl = makeNode('ExportDefaultDeclaration')
      node.parent = decl
      visitor.Literal(node)
      expect(reports).toHaveLength(0)
    })
  })

  describe('real-world true positives (should report)', () => {
    it('reports Portuguese: Salvar decisão', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('Salvar decisão'))
      expect(reports).toHaveLength(1)
    })

    it('reports Portuguese: Gestão de jurisprudência', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('Gestão de jurisprudência'))
      expect(reports).toHaveLength(1)
    })

    it('reports Portuguese alt text: imagem ilustrativa da tela de login', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('alt', literal('imagem ilustrativa da tela de login')))
      expect(reports).toHaveLength(1)
    })

    it('reports English aria-label: Text input container', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('aria-label', literal('Text input container')))
      expect(reports).toHaveLength(1)
    })

    it('reports Portuguese: Parágrafo único', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('Parágrafo único'))
      expect(reports).toHaveLength(1)
    })

    it('reports English: Click here to submit', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxAttr('title', literal('Click here to submit')))
      expect(reports).toHaveLength(1)
    })

    it('reports string in JSX expression: Are you sure?', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.Literal(jsxExprContainer(literal('Are you sure?')))
      expect(reports).toHaveLength(1)
    })

    it('reports mixed-case user text: Nenhum resultado encontrado', () => {
      const { context, reports } = createMockContext()
      const visitor = rule.create(context)
      visitor.JSXText(jsxText('Nenhum resultado encontrado'))
      expect(reports).toHaveLength(1)
    })
  })
})

// ─── enforce-keys-sync ───────────────────────────────────────────────────────

describe('enforce-keys-sync', () => {
  const fixtureDir = resolve(import.meta.dirname, '__fixtures_sync__')
  const localesDir = resolve(fixtureDir, 'locales')

  beforeEach(() => {
    mkdirSync(resolve(localesDir, 'pt-BR'), { recursive: true })
    mkdirSync(resolve(localesDir, 'pt'), { recursive: true })
    writeFileSync(resolve(fixtureDir, 'package.json'), '{}')
  })

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
  })

  it('reports missing keys in secondary locale', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ save: 'Salvar', cancel: 'Cancelar', delete: 'Excluir' }),
    )
    writeFileSync(
      resolve(localesDir, 'pt', 'common.json'),
      JSON.stringify({ save: 'Salvar' }),
    )

    const plugin = await loadPlugin()
    const rule = plugin.rules['enforce-keys-sync']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    const missingReports = reports.filter((r) => r.messageId === 'missingKey')
    expect(missingReports).toHaveLength(2)
    expect(missingReports.map((r) => r.data!.key)).toContain('common.cancel')
    expect(missingReports.map((r) => r.data!.key)).toContain('common.delete')
  })

  it('reports unexpected keys in secondary locale', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ save: 'Salvar' }),
    )
    writeFileSync(
      resolve(localesDir, 'pt', 'common.json'),
      JSON.stringify({ save: 'Salvar', extraKey: 'Extra' }),
    )

    const plugin = await loadPlugin()
    const rule = plugin.rules['enforce-keys-sync']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    const unexpectedReports = reports.filter((r) => r.messageId === 'unexpectedKey')
    expect(unexpectedReports).toHaveLength(1)
    expect(unexpectedReports[0].data!.key).toBe('common.extraKey')
  })

  it('reports all keys when entire file is missing in secondary locale', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'errors.json'),
      JSON.stringify({ notFound: '404', forbidden: '403' }),
    )
    // pt/errors.json does not exist

    const plugin = await loadPlugin()
    const rule = plugin.rules['enforce-keys-sync']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    const missingReports = reports.filter((r) => r.messageId === 'missingKey')
    expect(missingReports).toHaveLength(2) // 2 keys missing in pt
  })

  it('handles nested keys correctly', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ form: { save: 'Salvar', cancel: 'Cancelar' } }),
    )
    writeFileSync(
      resolve(localesDir, 'pt', 'common.json'),
      JSON.stringify({ form: { save: 'Salvar' } }),
    )

    const plugin = await loadPlugin()
    const rule = plugin.rules['enforce-keys-sync']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    const missingReports = reports.filter(
      (r) => r.messageId === 'missingKey' && r.data!.locale === 'pt',
    )
    expect(missingReports.some((r) => r.data!.key === 'common.form.cancel')).toBe(true)
  })

  it('reports no issues when locales are perfectly in sync', async () => {
    mkdirSync(resolve(localesDir, 'en'), { recursive: true })
    const content = JSON.stringify({ save: 'Salvar', cancel: 'Cancelar' })
    writeFileSync(resolve(localesDir, 'pt-BR', 'common.json'), content)
    writeFileSync(resolve(localesDir, 'pt', 'common.json'), content)
    writeFileSync(resolve(localesDir, 'en', 'common.json'), content)

    const plugin = await loadPlugin()
    const rule = plugin.rules['enforce-keys-sync']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('returns empty visitor when no options provided', async () => {
    const plugin = await loadPlugin()
    const rule = plugin.rules['enforce-keys-sync']
    const { context } = createMockContext()
    const visitor = rule.create(context)
    expect(visitor).toEqual({})
  })

  it('returns empty visitor when localesDir does not exist', async () => {
    const plugin = await loadPlugin()
    const rule = plugin.rules['enforce-keys-sync']
    const { context } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'nonexistent/path' }],
    })
    const visitor = rule.create(context)
    expect(visitor).toEqual({})
  })
})

// ─── no-unused-keys ──────────────────────────────────────────────────────────

describe('no-unused-keys', () => {
  const fixtureDir = resolve(import.meta.dirname, '__fixtures_unused__')
  const localesDir = resolve(fixtureDir, 'locales')
  const sourceDir = resolve(fixtureDir, 'src')

  beforeEach(() => {
    mkdirSync(resolve(localesDir, 'pt-BR'), { recursive: true })
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(resolve(fixtureDir, 'package.json'), '{}')
  })

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
  })

  it('reports keys not used in source code', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ used: 'Usado', unused: 'Não usado', alsoUnused: 'Também' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `const x = t('common.used')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(2)
    expect(reports.map((r) => r.data!.key)).toContain('common.unused')
    expect(reports.map((r) => r.data!.key)).toContain('common.alsoUnused')
  })

  it('detects t() with single quotes', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ save: 'Salvar' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `const x = t('common.save')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('detects t() with double quotes', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ save: 'Salvar' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `const x = t("common.save")`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('detects t() with backticks', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ save: 'Salvar' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), 'const x = t(`common.save`)')

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('detects i18n.t() calls', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ save: 'Salvar' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `i18n.t('common.save')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('detects <Trans i18nKey="..."> usage', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ welcome: 'Bem-vindo' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `<Trans i18nKey="common.welcome">`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('handles nested keys in JSON', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'form.json'),
      JSON.stringify({ buttons: { save: 'Salvar', cancel: 'Cancelar' } }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `t('form.buttons.save')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(1)
    expect(reports[0].data!.key).toBe('form.buttons.cancel')
  })

  it('respects ignoreKeys option with regex', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ unused: 'X', 'dynamic_key_1': 'Y', 'dynamic_key_2': 'Z' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `// no t() calls`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{
        baseLocale: 'pt-BR',
        localesDir: 'locales',
        sourceDir: 'src',
        ignoreKeys: ['^dynamic_'],
      }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(1)
    expect(reports[0].data!.key).toBe('common.unused')
  })

  it('considers partial key match (parent key used dynamically)', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'status.json'),
      JSON.stringify({ active: 'Ativo', inactive: 'Inativo' }),
    )
    // Code uses the parent namespace dynamically: t(`status.${value}`)
    // Our regex finds 'status' as a used key
    writeFileSync(resolve(sourceDir, 'app.tsx'), `t('status')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    // Both keys should be considered used via partial match on 'status'
    expect(reports).toHaveLength(0)
  })

  it('scans nested directories in source', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ deep: 'Profundo' }),
    )
    const nestedDir = resolve(sourceDir, 'pages', 'home')
    mkdirSync(nestedDir, { recursive: true })
    writeFileSync(resolve(nestedDir, 'index.tsx'), `t('common.deep')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('skips node_modules and generated directories', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ key: 'Value' }),
    )
    // Key only used in node_modules (should be ignored)
    const nmDir = resolve(sourceDir, 'node_modules', 'pkg')
    mkdirSync(nmDir, { recursive: true })
    writeFileSync(resolve(nmDir, 'index.ts'), `t('common.key')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(1) // Should still report as unused
  })

  it('returns empty visitor when no options provided', async () => {
    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context } = createMockContext()
    const visitor = rule.create(context)
    expect(visitor).toEqual({})
  })

  it('detects dynamic template literal t() with static prefix', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'errors.json'),
      JSON.stringify({ network: { timeout: 'Timeout', refused: 'Recusado' } }),
    )
    // Code uses dynamic key: t(`errors.network.${errorType}`)
    writeFileSync(resolve(sourceDir, 'app.tsx'), 'const x = t(`errors.network.${errorType}`)')

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    // Both keys should be considered used via partial match on 'errors.network'
    expect(reports).toHaveLength(0)
  })

  it('detects dynamic .t() template literal with static prefix', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'status.json'),
      JSON.stringify({ active: 'Ativo', inactive: 'Inativo' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), 'const x = i18n.t(`status.${value}`)')

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('normalizes camelCase namespace to match snake_case file name', async () => {
    // File is document_vault.json but code uses t('documentVault.X')
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'document_vault.json'),
      JSON.stringify({ title: 'Cofre', description: 'Descrição' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `const x = t('documentVault.title')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    // 'title' should be matched, only 'description' is unused
    expect(reports).toHaveLength(1)
    expect(reports[0].data!.key).toBe('document_vault.description')
  })

  it('normalizes camelCase namespace with dynamic template literal', async () => {
    // File is application_errors.json but code uses t(`applicationErrors.${code}.title`)
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'application_errors.json'),
      JSON.stringify({
        TIMEOUT: { title: 'Timeout', message: 'Msg' },
        NOT_FOUND: { title: '404', message: 'Msg' },
      }),
    )
    writeFileSync(
      resolve(sourceDir, 'app.tsx'),
      'const x = t(`applicationErrors.${code}.title`)',
    )

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    // All keys should be considered used via partial match on 'application_errors' (normalized from 'applicationErrors')
    expect(reports).toHaveLength(0)
  })

  it('handles multiple_words snake_case namespace with camelCase usage', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'my_account.json'),
      JSON.stringify({ profile: 'Perfil', settings: 'Configurações' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `t('myAccount.profile'); t('myAccount.settings')`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('recognizes i18next plural suffixes as used via base key', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'items.json'),
      JSON.stringify({
        count_zero: 'Nenhum item',
        count_one: '1 item',
        count_other: '{{count}} itens',
        unused: 'Não usado',
      }),
    )
    // Code uses t('items.count', { count }) — i18next resolves _one/_other at runtime
    writeFileSync(resolve(sourceDir, 'app.tsx'), `t('items.count', { count })`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    // Only 'unused' should be reported; plural variants are matched via base key
    expect(reports).toHaveLength(1)
    expect(reports[0].data!.key).toBe('items.unused')
  })

  it('recognizes nested plural keys with camelCase namespace', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'document_vault.json'),
      JSON.stringify({
        card: { documents_one: '1 doc', documents_other: '{{count}} docs' },
      }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `t('documentVault.card.documents', { count })`)

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(0)
  })

  it('handles multiple JSON files', async () => {
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'common.json'),
      JSON.stringify({ save: 'Salvar' }),
    )
    writeFileSync(
      resolve(localesDir, 'pt-BR', 'errors.json'),
      JSON.stringify({ notFound: '404' }),
    )
    writeFileSync(resolve(sourceDir, 'app.tsx'), `t('common.save')`)
    // errors.notFound is never used

    const plugin = await loadPlugin()
    const rule = plugin.rules['no-unused-keys']
    const { context, reports } = createMockContext({
      filename: resolve(fixtureDir, 'src', 'app.tsx'),
      options: [{ baseLocale: 'pt-BR', localesDir: 'locales', sourceDir: 'src' }],
    })
    const visitor = rule.create(context)
    visitor.Program?.(makeNode('Program'))

    expect(reports).toHaveLength(1)
    expect(reports[0].data!.key).toBe('errors.notFound')
  })
})
