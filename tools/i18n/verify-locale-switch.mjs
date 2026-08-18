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
  existsSync,
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

const isPatched = (contents) =>
  probes.some((probe) => contents.includes(probe.sentinel))

const patch = () => {
  // A leftover backup means an earlier run died between patch and restore, and
  // the backup is then the only clean copy. Recover it - but only when the
  // catalog on disk is actually still patched. A backup left behind by a run
  // whose sentinels are long gone is stale, and restoring it would revert a
  // catalog that has legitimately moved on since (a Weblate sync, say).
  if (existsSync(backup)) {
    if (isPatched(readFileSync(catalog, 'utf8'))) {
      copyFileSync(backup, catalog)
      console.warn('Recovered sv.po from an interrupted earlier run.')
    } else {
      console.warn('Discarded a stale sv.po backup; the catalog was not patched.')
    }
    rmSync(backup, { force: true })
  }
  copyFileSync(catalog, backup)
  let contents = readFileSync(catalog, 'utf8')

  for (const probe of probes) {
    contents = withSentinel(contents, probe.msgid, probe.sentinel)
  }

  writeFileSync(catalog, contents)
}

const restore = () => {
  if (!existsSync(backup)) return
  copyFileSync(backup, catalog)
  rmSync(backup, { force: true })
}

// `finally` does not run when a signal kills the process, and a dead run must
// not leave sentinels in the working tree for the next commit to pick up.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restore()
    process.exit(signal === 'SIGINT' ? 130 : 143)
  })
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
  const skipped = new Set()

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Boot with no stored preference: the app must come up in English, or a
    // sentinel below would prove nothing about the switch.
    await page.goto(`${baseUrl}/overview`, { waitUntil: 'networkidle' })
    const beforeSwitch = await page.content()
    for (const probe of probes) {
      if (beforeSwitch.includes(probe.sentinel)) {
        failures.push(
          `${probe.form}: ${probe.sentinel} rendered before any switch - the instance did not start in English`,
        )
      }
    }

    // Switch in-session through the real picker. Seeding localStorage before
    // boot would only exercise initial catalog loading; the regression this
    // guards is a mounted tree that keeps its old language after the picker
    // is used - a component missing its useLingui subscription.
    await page.goto(`${baseUrl}/settings/main`, { waitUntil: 'networkidle' })
    const picked = await page.evaluate(() => {
      const selects = [...document.querySelectorAll('select')]
      const select = selects.find((entry) =>
        [...entry.options].some((option) => option.value === 'sv'),
      )
      if (!select) return false
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      ).set
      setValue.call(select, 'sv')
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })
    if (!picked) {
      throw new Error('language picker not found on /settings/main')
    }
    // The save flow is how the choice applies. The PATCH it sends resubmits
    // the form's unchanged values; the locale itself never reaches the server.
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // PROBE-TRANS sits in the always-mounted navigation, so it must appear
    // WITHOUT any navigation for this to count as an in-session switch.
    const switched = await page
      .waitForFunction(
        (sentinel) => document.body.innerText.includes(sentinel),
        probes[0].sentinel,
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false)
    if (!switched) {
      failures.push(
        `${probes[0].form}: ${probes[0].sentinel} did not appear in the mounted tree after the picker switch`,
      )
    }

    // A fresh navigation then renders from the stored choice.
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
      skipped.add('PROBE-ALIAS')
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

  return { failures, skipped }
}

let failures = []
let skippedProbes = new Set()
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
    ;({ failures, skipped: skippedProbes } = await run())
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
  for (const probe of probes) {
    const status = skippedProbes.has(probe.sentinel) ? 'skip' : 'ok  '
    console.log(`  ${status}  ${probe.form}`)
  }
}
