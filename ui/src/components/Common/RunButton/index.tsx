import { ReactNode } from 'react'
import { SmallLoadingSpinner } from '../LoadingSpinner'

interface IRunButton {
  text: string
  svgIcon: ReactNode
  executing?: boolean
  disabled?: boolean
  onClick: () => void
}

const RunButton = (props: IRunButton) => {
  return (
    <button
      className="right-5 m-auto flex h-8 w-full rounded-t bg-amber-900 text-white shadow-md hover:bg-amber-800 xl:rounded-l xl:rounded-r-none"
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <div className="m-auto ml-auto flex">
        {props.executing ? (
          <SmallLoadingSpinner className="m-auto ml-2 h-5" />
        ) : (
          props.svgIcon
        )}{' '}
        <p className="button-text m-auto ml-1 text-zinc-200">{props.text}</p>
      </div>
    </button>
  )
}

export default RunButton
