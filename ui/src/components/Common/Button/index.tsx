import React, { ForwardedRef, type JSX } from 'react'

export type ButtonType =
  | 'default'
  | 'primary'
  | 'danger'
  | 'warning'
  | 'success'
  | 'ghost'
  | 'twin-primary-l'
  | 'twin-primary-r'
  | 'twin-secondary-l'
  | 'twin-secondary-r'

// Helper type to override types (overrides onClick)
type MergeElementProps<
  T extends React.ElementType,
  P extends Record<string, unknown>,
> = Omit<React.ComponentProps<T>, keyof P> & P

type ElementTypes = 'button' | 'a'

type Element<P extends ElementTypes = 'button'> = P extends 'a'
  ? HTMLAnchorElement
  : HTMLButtonElement

type BaseProps<P> = {
  buttonType?: ButtonType
  buttonSize?: 'default' | 'lg' | 'md' | 'sm'
  // Had to do declare this manually as typescript would assume e was of type any otherwise
  onClick?: (
    e: React.MouseEvent<P extends 'a' ? HTMLAnchorElement : HTMLButtonElement>,
  ) => void
}

type ButtonProps<P extends React.ElementType> = {
  as?: P
} & MergeElementProps<P, BaseProps<P>>

function Button<P extends ElementTypes = 'button'>(
  {
    buttonType = 'default',
    buttonSize = 'default',
    as,
    children,
    className,
    ...props
  }: ButtonProps<P>,
  ref?: React.Ref<Element<P>>,
): JSX.Element {
  const buttonStyle = [
    'inline-flex items-center justify-center border border-transparent leading-5 font-medium focus:outline-none transition ease-in-out duration-150 cursor-pointer disabled:opacity-50 whitespace-nowrap',
  ]
  switch (buttonType) {
    case 'primary':
      buttonStyle.push(
        'text-white bg-amber-600 border-amber-600 hover:bg-amber-500 hover:border-amber-500 rounded-md focus:border-amber-700 focus:ring-amber active:bg-amber-700 active:border-amber-700',
      )
      break
    case 'danger':
      buttonStyle.push(
        'text-white bg-red-600 border-red-600 hover:bg-red-500 hover:border-red-500 focus:border-red-700 rounded-md focus:ring-red active:bg-red-700 active:border-red-700',
      )
      break
    case 'warning':
      buttonStyle.push(
        'text-white bg-zinc-800 border-zinc-800 hover:bg-zinc-600 hover:border-zinc-600 focus:border-zinc-700 rounded-md focus:ring-zinc active:bg-zinc-700 active:border-zinc-700',
      )
      break
    case 'success':
      buttonStyle.push(
        'text-white bg-amber-900 border-amber-900 hover:bg-amber-700 hover:border-amber-700 focus:border-amber-700 rounded-md focus:ring-amber active:bg-amber-700 active:border-amber-700',
      )
      break
    case 'ghost':
      buttonStyle.push(
        'text-white bg-transaprent border-zinc-600 hover:border-zinc-200 focus:border-zinc-100 rounded-md active:border-zinc-100',
      )
      break
    case 'twin-primary-l':
      buttonStyle.push(
        'text-white bg-amber-600 border-amber-600 hover:bg-amber-500 hover:border-amber-500 focus:border-amber-700 focus:ring-amber active:bg-amber-700 active:border-amber-700 rounded-l',
      )
      break
    case 'twin-primary-r':
      buttonStyle.push(
        'text-white bg-amber-600 border-amber-600 hover:bg-amber-500 hover:border-amber-500 focus:border-amber-700 focus:ring-amber active:bg-amber-700 active:border-amber-700 rounded-r',
      )
      break
    case 'twin-secondary-l':
      buttonStyle.push(
        'text-white bg-amber-900 border-amber-900 hover:bg-amber-700 hover:border-amber-700 focus:border-amber-700 focus:ring-amber active:bg-amber-700 active:border-amber-700 rounded-l',
      )
      break
    case 'twin-secondary-r':
      buttonStyle.push(
        'text-white bg-amber-900 border-amber-900 hover:bg-amber-700 hover:border-amber-700 focus:border-amber-700 focus:ring-amber active:bg-amber-700 active:border-amber-700 rounded-r',
      )
      break
    default:
      buttonStyle.push(
        'text-zinc-200 bg-zinc-600 border-zinc-600 hover:text-white hover:bg-zinc-500 hover:border-zinc-500 group-hover:text-white rounded-md group-hover:bg-zinc-500 group-hover:border-zinc-500 focus:border-amber-600 focus:ring-amber active:text-zinc-200 active:bg-zinc-500 active:border-zinc-500',
      )
  }

  switch (buttonSize) {
    case 'sm':
      buttonStyle.push('px-2.5 py-1.5 text-xs button-sm')
      break
    case 'lg':
      buttonStyle.push('px-6 py-3 text-base button-lg')
      break
    case 'md':
    default:
      buttonStyle.push('px-4 py-2 text-sm button-md')
  }

  buttonStyle.push(className ?? '')

  if (as === 'a') {
    return (
      <a
        className={buttonStyle.join(' ')}
        {...(props as React.ComponentProps<'a'>)}
        ref={ref as ForwardedRef<HTMLAnchorElement>}
      >
        <span className="flex items-center">{children}</span>
      </a>
    )
  } else {
    return (
      <button
        className={buttonStyle.join(' ')}
        {...(props as React.ComponentProps<'button'>)}
        ref={ref as ForwardedRef<HTMLButtonElement>}
      >
        <span className="flex items-center">{children}</span>
      </button>
    )
  }
}

export default React.forwardRef(Button) as typeof Button
