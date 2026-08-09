import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  Tailwind v4 runs Lightning CSS on the production build only, never on the dev
  server. Given a hand written prefix that follows its standard property,
  Lightning CSS keeps the prefixed declaration and drops the standard one, so
  the rule silently stops applying in browsers that only take the standard form
  (Firefox for backdrop-filter). Writing the prefix first keeps both.
*/

const STYLESHEETS = ['../styles/globals.css', '../styles/Home.module.css']

const PREFIXES = ['-webkit-', '-moz-', '-ms-', '-o-']

interface Rule {
  selector: string
  properties: string[]
}

interface Violation {
  selector: string
  property: string
  standard: string
}

const stripComments = (css: string): string => {
  let out = ''
  let index = 0

  while (index < css.length) {
    if (css[index] === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2)
      index = end === -1 ? css.length : end + 2
      continue
    }

    out += css[index]
    index += 1
  }

  return out
}

/**
 * Collects the property names declared directly inside each rule, in source
 * order. Selectors are dropped at their opening brace, so a prefixed pseudo
 * element (`::-webkit-scrollbar`) never reads as a declaration.
 */
const parseRules = (css: string): Rule[] => {
  const rules: Rule[] = []
  const open: Rule[] = []
  let buffer = ''
  let quote = ''
  let parens = 0

  for (const char of css) {
    if (quote) {
      buffer += char
      if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      buffer += char
      continue
    }

    // A value's own punctuation, e.g. the comma list inside linear-gradient().
    if (char === '(') {
      parens += 1
    } else if (char === ')') {
      parens -= 1
    }

    if (parens > 0 || (char !== '{' && char !== '}' && char !== ';')) {
      buffer += char
      continue
    }

    if (char === '{') {
      const rule = { selector: buffer.trim(), properties: [] }
      rules.push(rule)
      open.push(rule)
      buffer = ''
      continue
    }

    const declaration = buffer.trim()
    const colon = declaration.indexOf(':')
    const current = open[open.length - 1]

    if (current && colon > 0) {
      current.properties.push(declaration.slice(0, colon).trim())
    }

    buffer = ''

    if (char === '}') {
      open.pop()
    }
  }

  return rules
}

const findViolations = (css: string): Violation[] => {
  const violations: Violation[] = []

  for (const rule of parseRules(stripComments(css))) {
    rule.properties.forEach((property, index) => {
      const prefix = PREFIXES.find((candidate) =>
        property.startsWith(candidate),
      )

      if (!prefix) {
        return
      }

      const standard = property.slice(prefix.length)
      const standardIndex = rule.properties.indexOf(standard)

      if (standardIndex !== -1 && standardIndex < index) {
        violations.push({ selector: rule.selector, property, standard })
      }
    })
  }

  return violations
}

const describeViolations = (violations: Violation[]): string[] =>
  violations.map(
    (violation) =>
      `${violation.selector}: move ${violation.property} above ${violation.standard}`,
  )

describe('vendor prefix order', () => {
  it('flags a prefix written after its standard property', () => {
    const css = `.glass {
      background-color: rgb(24 24 27 / 0.22);
      backdrop-filter: blur(5.8px);
      -webkit-backdrop-filter: blur(5.8px);
    }`

    expect(describeViolations(findViolations(css))).toEqual([
      '.glass: move -webkit-backdrop-filter above backdrop-filter',
    ])
  })

  it('accepts a prefix written before its standard property', () => {
    const css = `.glass {
      -webkit-backdrop-filter: blur(5.8px);
      backdrop-filter: blur(5.8px);
    }`

    expect(findViolations(css)).toEqual([])
  })

  it('ignores a prefix with no standard counterpart in the rule', () => {
    const css = `.scroller {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    input::-webkit-search-cancel-button {
      -webkit-appearance: none;
    }`

    expect(findViolations(css)).toEqual([])
  })

  it.each(STYLESHEETS)('holds for %s', (stylesheet) => {
    const css = readFileSync(new URL(stylesheet, import.meta.url), 'utf8')

    expect(describeViolations(findViolations(css))).toEqual([])
  })
})
