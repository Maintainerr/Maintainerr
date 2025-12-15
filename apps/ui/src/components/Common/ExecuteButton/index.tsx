import { PlayIcon } from '@heroicons/react/solid'
import { SmallLoadingSpinner } from '../LoadingSpinner'

interface IExecuteButton {
  text: string
  onClick: () => void
  executing?: boolean
  disabled?: boolean
}

const ExecuteButton = (props: IExecuteButton) => {
  return (
    <button
      className="edit-button m-auto flex h-9 rounded text-zinc-200 shadow-md"
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.executing ? (
        <SmallLoadingSpinner className="m-auto ml-2 h-5" />
      ) : (
        <PlayIcon className="m-auto ml-4 h-5" />
      )}{' '}
      <p className="rules-button-text m-auto ml-1 mr-4">{props.text}</p>
    </button>
  )
}

export default ExecuteButton
