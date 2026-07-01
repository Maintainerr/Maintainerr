import { ARR_TAG_LABEL_HINT, isValidArrTagLabel } from '@maintainerr/contracts'
import { useForm, useWatch } from 'react-hook-form'
import { usePatchSettings, useSettings } from '../../../api/settings'
import SaveButton from '../../Common/SaveButton'
import { Input } from '../../Forms/Input'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

type ArrService = 'radarr' | 'sonarr'

interface ExclusionTagSettingsProps {
  service: ArrService
}

interface ExclusionTagFormValues {
  enabled: boolean
  tag: string
  untag: boolean
}

const COPY: Record<ArrService, { name: string; entity: string }> = {
  radarr: { name: 'Radarr', entity: 'movie' },
  sonarr: { name: 'Sonarr', entity: 'series' },
}

/**
 * Per-service Radarr/Sonarr exclusion-tag settings (https://features.maintainerr.info/posts/81). Radarr and Sonarr are
 * configured independently - this renders one service's settings on its own
 * settings page. The label/enable/removal map to that service's columns; only
 * the apply/remove logic is shared on the server.
 */
const ExclusionTagSettings = ({ service }: ExclusionTagSettingsProps) => {
  const { name, entity } = COPY[service]
  // A non-zero staleTime stops the shared settings query refetching on every tab
  // mount, which is what made the section flicker when switching Radarr/Sonarr.
  const { data: settings } = useSettings({ staleTime: 30_000 })
  const { feedback, showError, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback(`${name} exclusion tag settings`)
  const { mutateAsync: updateSettings, isPending } = usePatchSettings()

  // `values` keeps the form in sync with loaded settings without a useEffect.
  const { register, handleSubmit, reset, control } =
    useForm<ExclusionTagFormValues>({
      values: {
        enabled: settings?.[`${service}_tag_exclusions`] ?? false,
        tag: settings?.[`${service}_exclusion_tag`] ?? 'dnd',
        untag: settings?.[`${service}_untag_on_unexclude`] ?? false,
      },
    })

  // useWatch (not watch()) so the React Compiler can memoize safely.
  const enabled = useWatch({ control, name: 'enabled' })

  const submit = async (data: ExclusionTagFormValues) => {
    clearError()

    const trimmedLabel = data.tag.trim()
    // Enforce exactly the *arr tag charset so the user gets a clear up-front
    // expectation instead of a silent Radarr/Sonarr rejection.
    if (data.enabled && !isValidArrTagLabel(trimmedLabel)) {
      showError(
        trimmedLabel === ''
          ? `A tag label is required when exclusion tagging is enabled. ${ARR_TAG_LABEL_HINT}.`
          : `"${trimmedLabel}" is not a valid ${name} tag. ${ARR_TAG_LABEL_HINT}, with no leading, trailing, or repeated hyphens.`,
      )
      return
    }

    try {
      const labelToSave = trimmedLabel || 'dnd'
      await updateSettings({
        [`${service}_tag_exclusions`]: data.enabled,
        [`${service}_exclusion_tag`]: labelToSave,
        [`${service}_untag_on_unexclude`]: data.untag,
      })
      reset({ ...data, tag: labelToSave })
      showUpdated()
    } catch {
      showUpdateError()
    }
  }

  return (
    <div className="section mt-8 border-t border-zinc-700 pt-6">
      {/* Status always at the very top of the section. */}
      <SettingsFeedbackAlert feedback={feedback} />

      <h3 className="heading">Exclusion tag</h3>
      <p className="description">
        Apply a protective tag to the matching {name} {entity} whenever
        Maintainerr excludes an item, so {name} carries a single source of truth
        for &quot;do not touch&quot;.
      </p>

      <form onSubmit={handleSubmit(submit)}>
        <div className="form-row items-center">
          <label htmlFor={`${service}_tag_exclusions`} className="text-label">
            Tag excluded content
            <p className="text-xs font-normal">
              Add the tag below to {name} when an item is excluded
            </p>
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <input
                type="checkbox"
                id={`${service}_tag_exclusions`}
                className="checkbox"
                {...register('enabled')}
              />
            </div>
          </div>
        </div>

        <div className="form-row">
          <label htmlFor={`${service}_exclusion_tag`} className="text-label">
            Tag label
            <p className="text-xs font-normal">
              The {name} tag to apply, created if missing.
              <span className="block">{ARR_TAG_LABEL_HINT}.</span>
            </p>
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <Input
                {...register('tag')}
                id={`${service}_exclusion_tag`}
                type="text"
                placeholder="dnd"
                disabled={!enabled}
              />
            </div>
          </div>
        </div>

        <div className="form-row items-center">
          <label
            htmlFor={`${service}_untag_on_unexclude`}
            className="text-label"
          >
            Remove tag on un-exclude
            <p className="text-xs font-normal">
              Off by default so a manually-set tag is never stripped. When on,
              Maintainerr removes only this label when an item is un-excluded.
            </p>
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <input
                type="checkbox"
                id={`${service}_untag_on_unexclude`}
                className="checkbox"
                disabled={!enabled}
                {...register('untag')}
              />
            </div>
          </div>
        </div>

        <div className="actions mt-5 w-full">
          <div className="flex justify-end">
            <span className="ml-3 inline-flex rounded-md shadow-xs">
              <SaveButton
                type="submit"
                disabled={isPending}
                isPending={isPending}
              />
            </span>
          </div>
        </div>
      </form>
    </div>
  )
}

export default ExclusionTagSettings
