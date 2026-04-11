import { describe, expect, it } from 'vitest'
import { ServarrAction } from '@maintainerr/contracts'
import { ruleGroupFormSchema } from './index'

describe('ruleGroupFormSchema', () => {
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

    expect(result.error.flatten().fieldErrors.radarrQualityProfileId).toContain(
      'Quality profile is required for this action',
    )
  })
})
