import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { InputHTMLAttributes, Ref } from 'react'
import { Input } from './Input'

type DatalistInputProps = {
  name: string
  /** Id of the `<datalist>` holding the options. */
  list: string
  className?: string
  error?: boolean
  ref?: Ref<HTMLInputElement>
} & InputHTMLAttributes<HTMLInputElement>

/**
 * A picker for lists too long to scroll: it reads as a `Select` (same field
 * styling, same chevron) but filters as you type, and its options live in one
 * shared `<datalist>` instead of being repeated in every field.
 */
export const DatalistInput = ({
  className,
  ref,
  ...props
}: DatalistInputProps) => {
  return (
    <div className="relative w-full">
      <Input
        {...props}
        ref={ref}
        type="text"
        autoComplete="off"
        className={clsx('pr-9', className)}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  )
}
