import clsx from 'clsx'
import { ReactNode, SelectHTMLAttributes, forwardRef } from 'react'

export type SelectProps = {
  children?: ReactNode
  className?: string
  error?: boolean
} & SelectHTMLAttributes<HTMLSelectElement>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, error, required, ...props }: SelectProps, ref) => {
    return (
      <select
        {...props}
        ref={ref}
        className={clsx(
          'block w-full min-w-0 flex-1 rounded-md border border-zinc-500 bg-zinc-700 text-white shadow-sm transition duration-150 ease-in-out disabled:opacity-50 sm:text-sm sm:leading-5',
          {
            '!border-red-500 outline-red-500 focus:border-red-500 focus:outline-none focus:ring-0':
              !props.disabled && error,
            className,
          },
        )}
        aria-required={required}
        aria-invalid={error}
      >
        {children}
      </select>
    )
  },
)

Select.displayName = 'Select'

type SelectGroupProps = {
  name: string
  label: string
  children?: ReactNode
  error?: string
} & SelectHTMLAttributes<HTMLSelectElement>

export const SelectGroup = forwardRef<HTMLSelectElement, SelectGroupProps>(
  ({ label, ...props }: SelectGroupProps, ref) => {
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
                className={'mt-2 min-h-5 text-sm text-red-500'}
                id={`${props.name}-error`}
              >
                {props.error}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  },
)

SelectGroup.displayName = 'SelectGroup'
