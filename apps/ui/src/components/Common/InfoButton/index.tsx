import { InformationCircleIcon } from '@heroicons/react/solid'
import Button from '../Button'

interface IInfoButton {
  text: string
  onClick: () => void
  enabled?: boolean
}

const InfoButton = (props: IInfoButton) => {
  return (
    <Button
      buttonType="success"
      disabled={props.enabled !== undefined ? !props.enabled : false}
      className="mb-2 md:ml-2"
      onClick={props.onClick}
    >
      <InformationCircleIcon className="mr-2 h-5 w-5" />
      {props.text}
    </Button>
  )
}

export default InfoButton
