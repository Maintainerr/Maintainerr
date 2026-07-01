import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ReactNode, Ref, SelectHTMLAttributes } from 'react'

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
  error?: string
  ref?: Ref<HTMLSelectElement>
} & SelectHTMLAttributes<HTMLSelectElement>

export const SelectGroup = ({ label, ref, ...props }: SelectGroupProps) => {
  return (
    <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
      <label htmlFor={props.id || props.name} className="sm:mt-2">
        {label} {props.required && <>*</>}
      </label>
      <div className="px-3 py-2 sm:col-span-2">
        <div className="max-w-xl">
          <Select
            {...props}
            ref={ref}
            aria-describedby={props.error ? `${props.name}-error` : undefined}
            error={!!props.error}
          />
          {props.error && (
            <p
              className={'mt-2 min-h-5 text-sm text-error-500'}
              id={`${props.name}-error`}
            >
              {props.error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
