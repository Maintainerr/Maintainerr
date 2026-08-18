import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { describe, expect, it } from 'vitest'
import { formatOverlayProcessSummary } from '../utils/overlayProcessResult'
import { getCollectionMediaSortConfig } from '../components/Common/MediaLibrarySortControl'

/**
 * Plain modules translate through `t` from `@lingui/core/macro`, which the
 * compiler rewrites into a catalog lookup. Nothing else in the suite proves
 * that rewrite happened - an untransformed `t` is a plain template tag that
 * returns the source string, so every other assertion would still pass while
 * those strings silently stayed English for every locale.
 *
 * The macro derives a message id from the source text, so `msg` on the same
 * text yields the id `t` looks up. That keeps this test free of hardcoded
 * hashes: build a catalog keyed by the descriptor's own id, then assert the
 * real function returns the translated text.
 */
const catalogFor = (entries: { id: string; translation: string }[]) =>
  Object.fromEntries(entries.map((e) => [e.id, e.translation]))

describe('core macro', () => {
  it('resolves a plain module string through the active catalog', () => {
    const deleteSoonest = msg`Delete Soonest`

    i18n.loadAndActivate({
      locale: 'sv',
      messages: catalogFor([
        { id: deleteSoonest.id, translation: 'Raderas snarast' },
      ]),
    })

    const options = getCollectionMediaSortConfig('movie', true).options
    expect(options.map((option) => option.label)).toContain('Raderas snarast')
  })

  it('resolves an interpolated plain module string', () => {
    // Same labelled placeholders as the source, so the derived id matches.
    const summary = msg`Processed: ${{ processed: 0 }}, Reverted: ${{ reverted: 0 }}, Skipped: ${{ skipped: 0 }}, Errors: ${{ errors: 0 }}`

    i18n.loadAndActivate({
      locale: 'sv',
      messages: catalogFor([
        {
          id: summary.id,
          translation:
            'Bearbetade: {processed}, Aterstallda: {reverted}, Hoppade over: {skipped}, Fel: {errors}',
        },
      ]),
    })

    expect(
      formatOverlayProcessSummary({
        processed: 3,
        reverted: 2,
        skipped: 1,
        errors: 0,
      }),
    ).toBe('Bearbetade: 3, Aterstallda: 2, Hoppade over: 1, Fel: 0')
  })
})
