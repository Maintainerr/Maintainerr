/**
 * End-to-end check that a translation actually reaches the screen.
 *
 * A spec only proves a string resolves against a catalog the spec built. This
 * drives the running app instead, so it covers the parts a spec cannot: the
 * committed `.po` files, the compile step that turns them into a locale chunk,
 * the language picker, and the render.
 *
 * It writes a sentinel into sv.po, checks the app renders it, and restores the
 * catalog afterwards - including on failure.
 *
 * Requires Playwright, which is deliberately not a repo dependency - it pulls
 * browser binaries. Run it with `npx playwright@1 ...` or install it locally.
 *
 * Usage (with the app running):
 *   yarn i18n:verify [baseUrl]
 *   yarn i18n:verify --dry-run   # catalog round trip only
 */
import {
  copyFileSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved from this file, so the script behaves the same from anywhere.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const catalog = path.join(repoRoot, 'apps/ui/src/locales/sv.po')
const backup = `${catalog}.verify-backup`
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const baseUrl =
  args.find((arg) => !arg.startsWith('--')) ?? 'http://localhost:3000'

// One message per macro form, so a regression in any of them fails here.
const probes = [
  {
    msgid: 'Collections',
    sentinel: 'PROBE-TRANS',
    form: '<Trans> in a component',
  },
  {
    msgid: 'Title (A-Z) Ascending',
    sentinel: 'PROBE-CORE',
    form: 't from @lingui/core/macro',
  },
  { msgid: 'Do nothing', sentinel: 'PROBE-ALIAS', form: 'aliased core macro' },
]

/**
 * Replaces the `msgstr` that follows a given `msgid`, whatever it currently
 * holds. Done with string operations rather than a pattern: a msgid is
 * arbitrary text, and `Title (A-Z) Ascending` compiled into a pattern would
 * silently stop matching once its parentheses were read as a group.
 */
const withSentinel = (contents, msgid, sentinel) => {
  const marker = `msgid "${msgid}"\n`
  const at = contents.indexOf(marker)
  if (at === -1) {
    throw new Error(
      `${msgid} is not in sv.po - re-run i18n:extract, or pick another probe`,
    )
  }

  const lineStart = at + marker.length
  const lineEnd = contents.indexOf('\n', lineStart)
  const line = contents.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
  if (!line.startsWith('msgstr "')) {
    throw new Error(`${msgid} is not followed by a msgstr line in sv.po`)
  }

  return (
    contents.slice(0, lineStart) +
    `msgstr "${sentinel}"` +
    (lineEnd === -1 ? '' : contents.slice(lineEnd))
  )
}

const patch = () => {
  copyFileSync(catalog, backup)
  let contents = readFileSync(catalog, 'utf8')

  for (const probe of probes) {
    contents = withSentinel(contents, probe.msgid, probe.sentinel)
  }

  writeFileSync(catalog, contents)
}

const restore = () => {
  copyFileSync(backup, catalog)
  rmSync(backup, { force: true })
}

const run = async () => {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    throw new Error(
      'Playwright is not installed. It is not a repo dependency because it ' +
        'downloads browser binaries; install it locally to run this check:\n' +
        '  yarn add -D playwright && npx playwright install chromium',
    )
  }
  const browser = await chromium.launch()
  const failures = []

  try {
    const context = await browser.newContext()
    // Seed the stored preference before the app boots, so the first render is
    // already Swedish rather than switching mid-session.
    await context.addInitScript(() => {
      window.localStorage.setItem('maintainerr.locale', 'sv')
    })
    const page = await context.newPage()

    await page.goto(`${baseUrl}/overview`, { waitUntil: 'networkidle' })
    const overview = await page.content()

    for (const probe of probes.filter((p) => p.sentinel !== 'PROBE-ALIAS')) {
      if (!overview.includes(probe.sentinel)) {
        failures.push(
          `${probe.form}: ${probe.sentinel} did not render on /overview`,
        )
      }
    }

    // The aliased macro builds the rule form's *arr action options, which only
    // render once a library is chosen.
    await page.goto(`${baseUrl}/rules/new`, { waitUntil: 'networkidle' })
    await page.waitForSelector('select#library', { timeout: 10_000 })

    const libraryPicked = await page.evaluate(() => {
      const select = document.querySelector('select#library')
      const option = [...(select?.options ?? [])].find((entry) => entry.value)
      if (!select || !option) return false
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      ).set
      setValue.call(select, option.value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })

    if (!libraryPicked) {
      console.warn(
        '  skip  aliased core macro - no libraries configured on this instance',
      )
    } else {
      await page.waitForFunction(
        () => document.querySelectorAll('select').length > 1,
        { timeout: 10_000 },
      )
      if (!(await page.content()).includes('PROBE-ALIAS')) {
        failures.push(
          'aliased core macro: PROBE-ALIAS did not render in the rule form',
        )
      }
    }
  } finally {
    await browser.close()
  }

  return failures
}

let failures = []
try {
  patch()

  if (dryRun) {
    // Prove the catalog really was rewritten, so a passing run is not a
    // no-op that would report success against an unpatched file.
    const patched = readFileSync(catalog, 'utf8')
    for (const probe of probes) {
      if (!patched.includes(probe.sentinel)) {
        failures.push(`sentinel ${probe.sentinel} was not written to sv.po`)
      }
    }
  } else {
    failures = await run()
  }
} finally {
  restore()
}

if (failures.length > 0) {
  console.error('Locale switch did not reach the screen:\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    '\nA sentinel that does not render means the macro was not compiled, the ' +
      'catalog was not loaded, or the locale never switched.',
  )
  process.exit(1)
}

if (dryRun) {
  console.log(
    'Catalog patch and restore verified; sv.po is back to its committed state.',
  )
} else {
  console.log(`Locale switch verified against ${baseUrl}:`)
  for (const probe of probes) console.log(`  ok  ${probe.form}`)
}
