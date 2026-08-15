import { DocumentTextIcon } from '@heroicons/react/solid'
import { Trans } from '@lingui/react/macro'
import Button from '../Button'

interface IDocsButton {
  text?: string
  page?: string
}

const DocsButton = (props: IDocsButton) => {
  const page = props.page?.toLowerCase() ?? ''

  return (
    <span className="inline-flex h-full w-full">
      <Button
        buttonType="default"
        type="button"
        as="a"
        target="_blank"
        href={`https://docs.maintainerr.info/${page}`}
        rel="noopener noreferrer"
      >
        <DocumentTextIcon />
        <span>{props.text ? props.text : <Trans>Docs</Trans>}</span>
      </Button>
    </span>
  )
}

export default DocsButton
