import { PlusCircleIcon } from '@heroicons/react/solid'

interface IAddButton {
  text: string
  onClick: () => void
}

const AddButton = (props: IAddButton) => {
  return (
    <button
      className="add-button bg-maintainerr-600 hover:bg-maintainerr m-auto flex h-9 rounded text-zinc-200 shadow-md"
      onClick={props.onClick}
    >
      {<PlusCircleIcon className="m-auto ml-4 h-5" />}
      <p className="rules-button-text m-auto ml-1 mr-4">{props.text}</p>
    </button>
  )
}

export default AddButton
