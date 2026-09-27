import { Trans } from '@lingui/react/macro'

export const ServiceUrlExamples = ({
  examples,
}: {
  examples: readonly [string, string]
}) => (
  <>
    <Trans>Example URL formats:</Trans>
    <br />
    <span className="whitespace-nowrap">{examples[0]}</span>,{' '}
    <span className="whitespace-nowrap">{examples[1]}</span>
  </>
)
