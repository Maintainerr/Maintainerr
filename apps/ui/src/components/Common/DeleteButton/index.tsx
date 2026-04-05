import { ReactNode } from 'react'

interface IDeleteButton {
  text: string
  svgIcon?: ReactNode
  onClick: () => void
}

const DeleteButton = (props: IDeleteButton) => {
  return (
    <button
      className="bg-maintainerrdark hover:bg-maintainerrdark-800 right-5 m-auto flex h-8 w-full rounded-b text-white shadow-md xl:rounded-l-none xl:rounded-r"
      onClick={props.onClick}
    >
      <div className="m-auto ml-auto flex">
        {props.svgIcon ? props.svgIcon : undefined}
        <p className="button-text m-auto ml-1 text-zinc-200">{props.text}</p>
      </div>
    </button>
  )
}

export default DeleteButton
