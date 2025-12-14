import { InformationCircleIcon } from '@heroicons/react/solid'

interface IInfoButton {
  text: string
  onClick: () => void
  enabled?: boolean
}

const InfoButton = (props: IInfoButton) => {
  return (
    <button
      disabled={props.enabled !== undefined ? !props.enabled : false}
      className="mb-2 flex h-9 w-24 rounded bg-zinc-900 text-zinc-200 shadow-md hover:bg-zinc-800 disabled:opacity-50 md:ml-2"
      onClick={props.onClick}
    >
      {<InformationCircleIcon className="m-auto ml-5 h-5" />}{' '}
      <p className="rules-button-text m-auto ml-1 mr-5">{props.text}</p>
    </button>
  )
}

export default InfoButton
