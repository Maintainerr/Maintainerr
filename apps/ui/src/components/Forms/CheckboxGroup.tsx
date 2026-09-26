import type { InputHTMLAttributes, ReactNode, Ref } from 'react'

// A checkbox with its label and help text beside it, for the card layout.
export const CheckboxGroup = ({
  id,
  label,
  helpText,
  ref,
  ...props
}: {
  id: string
  label: ReactNode
  helpText?: ReactNode
  ref?: Ref<HTMLInputElement>
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => (
  <div className="flex items-start gap-3">
    <span className="flex pt-0.5">
      <input
        {...props}
        ref={ref}
        id={id}
        type="checkbox"
        className="checkbox"
        aria-describedby={helpText ? `${id}-help` : undefined}
      />
    </span>
    <div className="text-sm">
      <label htmlFor={id} className="mb-0 font-medium text-zinc-300">
        {label}
      </label>
      {helpText ? (
        <p id={`${id}-help`} className="mt-1 text-xs text-zinc-400">
          {helpText}
        </p>
      ) : null}
    </div>
  </div>
)
