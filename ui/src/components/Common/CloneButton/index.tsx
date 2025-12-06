import { ReactNode } from 'react'

interface ICloneButton {
  text: string
  svgIcon: ReactNode
  onClick: () => void
}

const CloneButton = (props: ICloneButton) => {
  return (
    <button
      className="right-5 m-auto flex h-8 w-full bg-blue-600 text-zinc-200 shadow-md hover:bg-blue-500 xl:rounded-none"
      onClick={props.onClick}
    >
      <div className="m-auto ml-auto flex">
        {props.svgIcon}
        <p className="button-text m-auto ml-1 text-zinc-200">{props.text}</p>
      </div>
    </button>
  )
}

export default CloneButton
