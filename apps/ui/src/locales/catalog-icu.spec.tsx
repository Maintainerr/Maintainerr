import { Trans } from '@lingui/react'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  icuArgumentKind,
  icuArguments,
  parsePo,
  richTextSlots,
} from '../../../../tools/i18n/po.mjs'
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
 *
 * The catalog and ICU parsing come from tools/i18n/po.mjs, the same module
 * yarn i18n:validate uses. A second implementation here would decide which
 * messages this spec renders, so the two drifting apart would narrow the guard
 * without failing anything.
 */
const localesDir = path.dirname(new URL(import.meta.url).pathname)

// One count per CLDR plural category across the 13 locales: a quoting bug
// lives in a single branch, so rendering only `other` would miss it. 0/1/2
// cover zero/one/two, 3 and 7 split few/many in Polish and Czech, 11 and 100
// catch the Welsh-style outliers other locales may add later.
const PLURAL_PROBES = [0, 1, 2, 3, 7, 11, 100]

const sentinelValues = (message: string, names: string[], count: number) => {
  const values: Record<string, unknown> = {}

  for (const name of names) {
    const kind = icuArgumentKind(message, name)
    // plural/ordinal arguments need a number, select needs a branch name, and
    // for both the sentinel is the value itself.
    if (kind === 'plural' || kind === 'selectordinal') values[name] = count
    else if (kind === 'select') values[name] = 'other'
    else values[name] = `sentinel-${name}`
  }

  return values
}

// Inline markup placeholders (<0>...</0>) need a component for each slot or
// the runtime drops their text. Only the slots the message itself declares are
// supplied - a generic 0-9 spread would satisfy a slot number the app never
// passes and hide it from this spec. validate-catalogs.mjs holds the
// source-vs-translation slot parity; this keeps the render honest.
const markupSlots = (message: string) =>
  Object.fromEntries(
    [...richTextSlots(message).slots].map((slot: string) => [
      slot,
      <span key={slot} />,
    ]),
  )

/**
 * Every message is rendered with `id` set to the message itself: with no
 * catalog loaded the runtime compiles the id as the message, which is exactly
 * the ICU parse the app performs.
 */
const findBrokenMessages = (messages: string[]): string[] => {
  const argumentsOf = (message: string) =>
    [...icuArguments(message)] as string[]
  const withArguments = messages.filter(
    (message) => argumentsOf(message).length > 0,
  )
  // A message with no plural/ordinal argument renders the same at every count,
  // so probe it once.
  const rows = withArguments.flatMap((message) => {
    const counted = argumentsOf(message).some((name) => {
      const kind = icuArgumentKind(message, name)
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
            values={sentinelValues(message, argumentsOf(message), count)}
            components={markupSlots(message)}
          />
        </li>
      ))}
    </ul>,
  )

  const cells = container.querySelectorAll('[data-row]')
  expect(cells).toHaveLength(rows.length)

  const broken = rows.filter(({ message }, index) => {
    const rendered = cells[index]?.textContent ?? ''
    return argumentsOf(message).some((name) => rendered.includes(`{${name}}`))
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
    const messages = parsePo(
      readFileSync(path.join(localesDir, 'en.po'), 'utf8'),
    ).map((entry: { msgid: string }) => entry.msgid)

    const broken = findBrokenMessages(messages)
    expect(broken, explain(broken)).toEqual([])
  })

  it.each(catalogs)('renders every argument in the %s translations', (name) => {
    const translations = parsePo(
      readFileSync(path.join(localesDir, name), 'utf8'),
    )
      .map((entry: { msgstr: string }) => entry.msgstr)
      .filter((translation: string) => translation.length > 0)

    const broken = findBrokenMessages(translations)
    expect(broken, explain(broken)).toEqual([])
  })
})

describe('PO escape decoding matches the runtime', () => {
  // A hand-rolled decoder used to read the octal escape "\0" as the digit "0",
  // so a source-locale msgstr of "<\0>x</\0>" looked identical to a "<0>x</0>"
  // msgid and slipped past the integrity, character and slot checks - while
  // Lingui decoded it to a real NUL, injecting a control character and dropping
  // the rich-text slot at runtime. Delegating the parse to pofile-ts removes
  // the gap; this locks it so a future decoder swap cannot reopen it.
  it('decodes an octal escape to a NUL, not the digit zero', () => {
    const po =
      'msgid ""\nmsgstr ""\n"Language: en\\n"\n\n' +
      'msgid "Frame <0>x</0>"\n' +
      'msgstr "Frame <\\0>x</\\0>"\n'
    const [entry] = parsePo(po) as Array<{ msgstr: string }>
    expect(entry.msgstr).toContain('\u0000')
    expect(entry.msgstr).not.toContain('<0>')
  })
})
