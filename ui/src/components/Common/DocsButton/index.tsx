import { DocumentTextIcon } from '@heroicons/react/solid'
import Button from '../Button'

interface IDocsButton {
  text?: string
  page?: string
}

const DocsButton = (props: IDocsButton) => {
  return (
    <span className="inline-flex h-full w-full">
      <Button
        buttonType="default"
        type="button"
        as="a"
        target="_blank"
        href={`https://docs.maintainerr.info/latest/${props.page ? props.page : ''}`}
        rel="noopener noreferrer"
      >
        <DocumentTextIcon />
        <span>{props.text ? props.text : 'Docs'}</span>
      </Button>
    </span>
  )
}

export default DocsButton
