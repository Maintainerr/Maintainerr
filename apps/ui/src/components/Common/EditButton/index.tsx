import { ReactNode } from 'react'

interface IEditButton {
  text: string
  svgIcon: ReactNode
  onClick: () => void
}

const EditButton = (props: IEditButton) => {
  return (
    <button
      className="right-5 m-auto flex h-8 w-full rounded-t bg-amber-600 text-zinc-200 shadow-md hover:bg-amber-500 xl:rounded-l xl:rounded-r-none"
      onClick={props.onClick}
    >
      <div className="m-auto ml-auto flex">
        {props.svgIcon}
        <p className="button-text m-auto ml-1 text-zinc-200">{props.text}</p>
      </div>
    </button>
  )
}

export default EditButton
