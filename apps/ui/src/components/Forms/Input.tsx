import clsx from 'clsx'
import { forwardRef, InputHTMLAttributes } from 'react'

type InputProps = {
  name: string
  className?: string
  error?: boolean
} & InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, required, error, ...props }: InputProps, ref) => {
    return (
      <input
        {...props}
        ref={ref}
        id={props.id || props.name}
        className={clsx(
          'block w-full min-w-0 flex-1 rounded-md border border-zinc-500 bg-zinc-700 text-white shadow-sm transition duration-150 ease-in-out focus:border-maintainerr-600 focus:outline-none focus:ring-0 disabled:opacity-50 sm:text-sm sm:leading-5',
          !props.disabled &&
            error &&
            '!border-error-500 outline-error-500 focus:border-error-500 focus:ring-0',
          className,
        )}
        aria-required={required}
        aria-invalid={error}
      />
    )
  },
)

Input.displayName = 'Input'

type InputGroupProps = {
  name: string
  label: string
  helpText?: JSX.Element | string
  error?: string
} & InputHTMLAttributes<HTMLInputElement>

export const InputGroup = forwardRef<HTMLInputElement, InputGroupProps>(
  ({ label, helpText, ...props }: InputGroupProps, ref) => {
    const ariaDescribedBy = []
    if (helpText) ariaDescribedBy.push(`${props.name}-help`)
    if (props.error) ariaDescribedBy.push(`${props.name}-error`)

    return (
      <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
        <label htmlFor={props.id || props.name} className="sm:mt-2">
          {label} {props.required && <>*</>}
          {helpText && (
            <p className={'text-xs font-normal'} id={`${props.name}-help`}>
              {helpText}
            </p>
          )}
        </label>
        <div className="px-3 py-2 sm:col-span-2">
          <div className="max-w-xl">
            <Input
              {...props}
              ref={ref}
              aria-describedby={
                ariaDescribedBy.length ? ariaDescribedBy.join(' ') : undefined
              }
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
  },
)

InputGroup.displayName = 'InputGroup'
