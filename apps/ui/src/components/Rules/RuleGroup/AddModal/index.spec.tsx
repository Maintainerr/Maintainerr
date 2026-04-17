import { ServarrAction } from '@maintainerr/contracts'
import { describe, expect, it } from 'vitest'
import { getStoredLibraryFallbackState, ruleGroupFormSchema } from './index'

describe('ruleGroupFormSchema', () => {
  it('allows missing arr server selection for fallback media server delete actions', () => {
    const result = ruleGroupFormSchema.safeParse({
      name: 'Rule group',
      description: '',
      libraryId: '1',
      dataType: 'movie',
      arrAction: ServarrAction.DELETE,
      deleteAfterDays: 30,
      keepLogsForMonths: 6,
      tautulliWatchedPercentOverride: undefined,
      showRecommended: true,
      showHome: true,
      overlayEnabled: false,
      overlayTemplateId: null,
      listExclusions: true,
      forceSeerr: false,
      manualCollection: false,
      manualCollectionName: '',
      sortTitle: '',
      active: true,
      useRules: true,
      radarrSettingsId: null,
      sonarrSettingsId: undefined,
      radarrQualityProfileId: undefined,
      sonarrQualityProfileId: undefined,
      ruleHandlerCronSchedule: null,
    })

    expect(result.success).toBe(true)
  })

  it('rejects null Radarr quality profile for CHANGE_QUALITY_PROFILE movie actions', () => {
    const result = ruleGroupFormSchema.safeParse({
      name: 'Rule group',
      description: '',
      libraryId: '1',
      dataType: 'movie',
      arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
      deleteAfterDays: undefined,
      keepLogsForMonths: 6,
      tautulliWatchedPercentOverride: undefined,
      showRecommended: true,
      showHome: true,
      overlayEnabled: false,
      overlayTemplateId: null,
      listExclusions: true,
      forceSeerr: false,
      manualCollection: false,
      manualCollectionName: '',
      sortTitle: '',
      active: true,
      useRules: true,
      radarrSettingsId: 1,
      sonarrSettingsId: undefined,
      radarrQualityProfileId: null,
      sonarrQualityProfileId: undefined,
      ruleHandlerCronSchedule: null,
    })

    expect(result.success).toBe(false)

    if (result.success) {
      return
    }

    expect(result.error.flatten().fieldErrors.radarrQualityProfileId).toEqual([
      'Quality profile is required for this action',
    ])
  })

  it('does not show the stored-library fallback while libraries are still loading', () => {
    expect(
      getStoredLibraryFallbackState('library-1', undefined, true, false),
    ).toEqual({
      storedLibraryResolved: false,
      storedLibraryMissing: false,
      showStoredLibraryFallback: false,
    })
  })

  it('shows the stored-library fallback when loading finished without the stored id or the query errored', () => {
    expect(
      getStoredLibraryFallbackState('library-1', undefined, false, true),
    ).toEqual({
      storedLibraryResolved: false,
      storedLibraryMissing: true,
      showStoredLibraryFallback: true,
    })

    expect(
      getStoredLibraryFallbackState(
        'library-1',
        [{ id: 'library-2', title: 'Shows', type: 'show' }],
        false,
        false,
      ),
    ).toEqual({
      storedLibraryResolved: false,
      storedLibraryMissing: true,
      showStoredLibraryFallback: true,
    })
  })
})
