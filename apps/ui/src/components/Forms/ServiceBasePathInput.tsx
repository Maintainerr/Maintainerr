import { Trans, useLingui } from '@lingui/react/macro'
import { stripTrailingSlashes } from '@maintainerr/contracts'
import { InputGroup } from './Input'

interface ServiceBasePathInputProps {
  name: string
  value: string
  onChange: (url: string) => void
  onBlur?: () => void
}

export const ServiceBasePathInput = ({
  name,
  value,
  onChange,
  onBlur,
}: ServiceBasePathInputProps) => {
  const { t } = useLingui()
  const url = URL.canParse(value) ? new URL(value) : undefined

  return (
    <InputGroup
      layout="stacked"
      type="text"
      name={`${name}-base-path`}
      label={t`Base Path`}
      helpText={
        <Trans>
          <strong>Optional</strong> path configured on the service.
        </Trans>
      }
      value={url?.pathname === '/' ? '' : (url?.pathname ?? '')}
      disabled={!url}
      onChange={(event) => {
        if (!url) return
        const nextUrl = new URL(url)
        nextUrl.pathname = event.target.value.trim()
        onChange(nextUrl.toString())
      }}
      onBlur={() => {
        if (url) {
          const normalized = stripTrailingSlashes(url.toString())
          if (normalized !== value) onChange(normalized)
        }
        onBlur?.()
      }}
    />
  )
}
