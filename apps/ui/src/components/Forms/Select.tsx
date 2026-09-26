import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ReactNode, Ref, SelectHTMLAttributes } from 'react'
import FieldGroup, {
  fieldDescribedBy,
  type FieldGroupLayout,
} from './FieldGroup'

// Field base styling lives in the global `input/select/textarea` rule in
// globals.css (single source of truth). Only select-specific deltas live here
// (hide the native arrow for the custom chevron, left-align, horizontal pad).
const selectClassNames = {
  base: 'appearance-none px-3 text-left',
  leadingAdornment:
    'inline-flex cursor-default items-center rounded-l-md border border-r-0 border-zinc-500 bg-zinc-700 px-3 text-sm text-zinc-100 transition duration-150 ease-in-out group-focus-within:border-maintainerr-600',
  joinedLeft: 'rounded-l-only rounded-r-none border-r-0',
  joinedRight: 'rounded-r-only border-l-0',
} as const

export type SelectProps = {
  children?: ReactNode
  className?: string
  error?: boolean
  join?: 'left' | 'right'
  ref?: Ref<HTMLSelectElement>
} & SelectHTMLAttributes<HTMLSelectElement>

export const Select = ({
  className,
  children,
  error,
  join,
  required,
  ref,
  ...props
}: SelectProps) => {
  const showChevron = !props.multiple && props.size == null

  return (
    <div className="relative w-full">
      <select
        {...props}
        ref={ref}
        id={props.id || props.name}
        className={clsx(
          selectClassNames.base,
          showChevron && 'pr-9',
          join === 'left' && selectClassNames.joinedLeft,
          join === 'right' && selectClassNames.joinedRight,
          !props.disabled &&
            error &&
            'border-error-500! outline-error-500 focus:border-error-500 focus:ring-0',
          className,
        )}
        aria-required={required}
        aria-invalid={error}
      >
        {children}
      </select>
      {showChevron ? (
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      ) : null}
    </div>
  )
}

type SelectAdornmentProps = {
  children?: ReactNode
  className?: string
}

export const SelectAdornment = ({
  children,
  className,
}: SelectAdornmentProps) => {
  return (
    <span className={clsx(selectClassNames.leadingAdornment, className)}>
      {children}
    </span>
  )
}

type SelectGroupProps = {
  name: string
  label: string
  children?: ReactNode
  helpText?: ReactNode
  error?: string
  layout?: FieldGroupLayout
  ref?: Ref<HTMLSelectElement>
} & SelectHTMLAttributes<HTMLSelectElement>

export const SelectGroup = ({
  label,
  helpText,
  layout,
  ref,
  ...props
}: SelectGroupProps) => {
  const id = props.id || props.name

  return (
    <FieldGroup
      layout={layout}
      id={id}
      label={label}
      required={props.required}
      helpText={helpText}
      error={props.error}
    >
      <Select
        {...props}
        id={id}
        ref={ref}
        aria-describedby={fieldDescribedBy(
          id,
          layout ?? 'row',
          helpText,
          props.error,
        )}
        error={!!props.error}
      />
    </FieldGroup>
  )
}
