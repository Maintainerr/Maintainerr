import { DocumentTextIcon } from '@heroicons/react/solid'
import Link from 'next/link'
import Button from '../Button'

interface IDocsButton {
  text?: string
  page?: string
}

const DocsButton = (props: IDocsButton) => {
  return (
    <span className="h-full w-full inline-flex">
      <Link
        href={`/docs/${props.page ? props.page : 'tutorial-Home'}.html`}
        passHref={true}
      >
        <a target="_blank" rel="noopener noreferrer">
          <Button buttonType="default" type="button">
            <DocumentTextIcon />
            <span>{props.text ? props.text : 'Docs'}</span>
          </Button>
        </a>
      </Link>
    </span>
  )
}

export default DocsButton
