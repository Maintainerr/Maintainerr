import { Trans } from '@lingui/react'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { render } from '../test-utils/render'

/**
 * Renders every message through the same runtime the UI uses, with a sentinel
 * per declared argument, and checks the sentinel reaches the output.
 *
 * This catches the ICU quoting trap: a single quote is an escape character, so
 * `'{name}'` renders the literal text `{name}` and silently drops the value. A
 * literal apostrophe beside a placeholder must be written `''`.
 *
 * Both sides are checked. Source text (`msgid`) is what this repo writes, and
 * translations (`msgstr`) are what Weblate sends back - a translator typing a
 * quote next to a placeholder breaks the message for their language only, and
 * placeholder-parity validation cannot see it because the placeholder is still
 * textually present.
 */
const localesDir = path.dirname(new URL(import.meta.url).pathname)

type CatalogEntry = { id: string; translation: string }

/** Reads `msgid`/`msgstr` pairs, joining the continuation lines of each. */
const catalogEntries = (contents: string): CatalogEntry[] => {
  const entries: CatalogEntry[] = []
  let id: string | null = null
  let translation = ''
  let field: 'id' | 'translation' | null = null

  const flush = () => {
    if (id) entries.push({ id, translation })
    id = null
    translation = ''
    field = null
  }

  for (const line of contents.split('\n')) {
    if (line.startsWith('msgid ')) {
      flush()
      id = JSON.parse(line.slice('msgid '.length)) as string
      field = 'id'
    } else if (line.startsWith('msgstr ')) {
      translation = JSON.parse(line.slice('msgstr '.length)) as string
      field = 'translation'
    } else if (line.startsWith('"') && field) {
      const chunk = JSON.parse(line) as string
      if (field === 'id') id += chunk
      else translation += chunk
    } else if (line.trim() === '') {
      flush()
    }
  }

  flush()
  // The header entry carries an empty id.
  return entries.filter((entry) => entry.id.length > 0)
}

/** Names declared by `{name}`, `{name, plural, ...}` and friends. */
const argumentNames = (message: string): string[] => {
  const names = new Set<string>()

  for (let i = 0; i < message.length; i += 1) {
    if (message[i] !== '{') continue

    let end = i + 1
    while (
      end < message.length &&
      message[end] !== ',' &&
      message[end] !== '}'
    ) {
      end += 1
    }

    const name = message.slice(i + 1, end).trim()
    if (name.length > 0 && [...name].every(isWordChar)) names.add(name)
  }

  return [...names]
}

const isWordChar = (char: string) =>
  (char >= 'a' && char <= 'z') ||
  (char >= 'A' && char <= 'Z') ||
  (char >= '0' && char <= '9') ||
  char === '_'

/** `plural`, `select`, `selectordinal`, or '' for a plain value. */
const argumentKind = (message: string, name: string): string => {
  const marker = `{${name}`
  let from = 0

  for (;;) {
    const at = message.indexOf(marker, from)
    if (at === -1) return ''

    let cursor = at + marker.length
    while (message[cursor] === ' ') cursor += 1
    if (message[cursor] !== ',') {
      from = at + 1
      continue
    }

    cursor += 1
    while (message[cursor] === ' ') cursor += 1

    let end = cursor
    while (end < message.length && isWordChar(message[end])) end += 1
    return message.slice(cursor, end)
  }
}

// One count per CLDR plural category across the 13 locales: a quoting bug
// lives in a single branch, so rendering only `other` would miss it. 0/1/2
// cover zero/one/two, 3 and 7 split few/many in Polish and Czech, 11 and 100
// catch the Welsh-style outliers other locales may add later.
const PLURAL_PROBES = [0, 1, 2, 3, 7, 11, 100]

const sentinelValues = (message: string, names: string[], count: number) => {
  const values: Record<string, unknown> = {}

  for (const name of names) {
    const kind = argumentKind(message, name)
    // plural/ordinal arguments need a number, select needs a branch name, and
    // for both the sentinel is the value itself.
    if (kind === 'plural' || kind === 'selectordinal') values[name] = count
    else if (kind === 'select') values[name] = 'other'
    else values[name] = `sentinel-${name}`
  }

  return values
}

// Inline markup placeholders (<0>...</0>) need a component for each slot or
// the runtime drops their text.
const markupSlots = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => [index, <span key={index} />]),
)

/**
 * Every message is rendered with `id` set to the message itself: with no
 * catalog loaded the runtime compiles the id as the message, which is exactly
 * the ICU parse the app performs.
 */
const findBrokenMessages = (messages: string[]): string[] => {
  const withArguments = messages.filter(
    (message) => argumentNames(message).length > 0,
  )
  // A message with no plural/ordinal argument renders the same at every count,
  // so probe it once.
  const rows = withArguments.flatMap((message) => {
    const names = argumentNames(message)
    const counted = names.some((name) => {
      const kind = argumentKind(message, name)
      return kind === 'plural' || kind === 'selectordinal'
    })
    return (counted ? PLURAL_PROBES : [0]).map((count) => ({ message, count }))
  })

  // One render for the batch: each probe becomes a row, so a failure names
  // the message rather than a row index.
  const { container } = render(
    <ul>
      {rows.map(({ message, count }, index) => (
        // Addressed by index: a message is arbitrary text and makes a fragile
        // attribute selector, and a lookup that silently misses would turn this
        // whole spec green.
        <li key={index} data-row={index}>
          <Trans
            id={message}
            values={sentinelValues(message, argumentNames(message), count)}
            components={markupSlots}
          />
        </li>
      ))}
    </ul>,
  )

  const cells = container.querySelectorAll('[data-row]')
  expect(cells).toHaveLength(rows.length)

  const broken = rows.filter(({ message }, index) => {
    const rendered = cells[index]?.textContent ?? ''
    return argumentNames(message).some((name) => rendered.includes(`{${name}}`))
  })

  return [...new Set(broken.map(({ message }) => message))]
}

const explain = (broken: string[]) =>
  'these messages print a placeholder instead of its value - a literal ' +
  `apostrophe beside one must be written '' :\n\n${broken.join('\n')}`

describe('translation catalogs', () => {
  const catalogs = readdirSync(localesDir).filter((name) =>
    name.endsWith('.po'),
  )

  it('renders every argument in the source text', () => {
    const messages = catalogEntries(
      readFileSync(path.join(localesDir, 'en.po'), 'utf8'),
    ).map((entry) => entry.id)

    const broken = findBrokenMessages(messages)
    expect(broken, explain(broken)).toEqual([])
  })

  it.each(catalogs)('renders every argument in the %s translations', (name) => {
    const translations = catalogEntries(
      readFileSync(path.join(localesDir, name), 'utf8'),
    )
      .map((entry) => entry.translation)
      .filter((translation) => translation.length > 0)

    const broken = findBrokenMessages(translations)
    expect(broken, explain(broken)).toEqual([])
  })
})
