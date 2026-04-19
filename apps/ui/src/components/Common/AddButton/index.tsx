import { PlusCircleIcon } from '@heroicons/react/solid'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Button, { type ButtonType } from '../Button'

interface IAddButton {
  text: string
  onClick: () => void
  icon?: ReactNode
  buttonType?: ButtonType
  buttonSize?: 'default' | 'lg' | 'md' | 'sm'
  className?: string
  title?: string
  disabled?: boolean
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
}

const AddButton = (props: IAddButton) => {
  return (
    <Button
      buttonType={props.buttonType ?? 'primary'}
      buttonSize={props.buttonSize ?? 'md'}
      className={`add-button m-auto ${props.className ?? ''}`.trim()}
      onClick={props.onClick}
      title={props.title}
      disabled={props.disabled}
      type={props.type ?? 'button'}
    >
      <span className="rules-button-text flex items-center gap-1">
        {props.icon ?? <PlusCircleIcon className="h-5 w-5" />}
        <span>{props.text}</span>
      </span>
    </Button>
  )
}

export default AddButton
