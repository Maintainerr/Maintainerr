import type { ReactNode } from 'react'

export type FieldGroupLayout = 'row' | 'stacked'

// The ids a control's aria-describedby points at. In the stacked layout an
// error takes the help line's place, so only one of the two is ever rendered.
export const fieldDescribedBy = (
  id: string,
  layout: FieldGroupLayout,
  helpText?: ReactNode,
  error?: string,
) => {
  const ids =
    layout === 'stacked'
      ? [error ? `${id}-error` : helpText ? `${id}-help` : '']
      : [helpText ? `${id}-help` : '', error ? `${id}-error` : '']
  return ids.filter(Boolean).join(' ') || undefined
}

// Label, help and error around one control. `row` is the settings-page grid
// (label beside the field); `stacked` is the card layout (label above).
const FieldGroup = ({
  layout = 'row',
  id,
  label,
  required,
  helpText,
  error,
  children,
}: {
  layout?: FieldGroupLayout
  id: string
  label: string
  required?: boolean
  helpText?: ReactNode
  error?: string
  children: ReactNode
}) => {
  const errorText = error ? (
    <p
      className={`mt-2 min-h-5 text-error-500 ${layout === 'stacked' ? 'text-xs' : 'text-sm'}`}
      id={`${id}-error`}
    >
      {error}
    </p>
  ) : null

  if (layout === 'stacked') {
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-zinc-300">
          {label} {required && <>*</>}
        </label>
        <div className="mt-1">{children}</div>
        {errorText ??
          (helpText ? (
            <p className="mt-2 min-h-5 text-xs text-zinc-400" id={`${id}-help`}>
              {helpText}
            </p>
          ) : null)}
      </div>
    )
  }

  return (
    <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
      <label htmlFor={id} className="sm:mt-2">
        {label} {required && <>*</>}
        {helpText ? (
          <p className="text-xs font-normal" id={`${id}-help`}>
            {helpText}
          </p>
        ) : null}
      </label>
      <div className="px-3 py-2 sm:col-span-2">
        <div className="max-w-xl">
          {children}
          {errorText}
        </div>
      </div>
    </div>
  )
}

export default FieldGroup
