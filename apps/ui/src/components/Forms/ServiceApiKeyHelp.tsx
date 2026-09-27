import { stripTrailingSlashes } from '@maintainerr/contracts'
import type { ReactNode } from 'react'
import BrandLink from '../Common/BrandLink'

interface ServiceApiKeyHelpProps {
  url: string
  path?: string
  children: ReactNode
}

export const ServiceApiKeyHelp = ({
  url,
  path = '',
  children,
}: ServiceApiKeyHelpProps) => {
  const parsed = URL.canParse(url) ? new URL(url) : undefined
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol))
    return <>{children}</>

  parsed.search = ''
  parsed.hash = ''
  return (
    <BrandLink
      external
      href={`${stripTrailingSlashes(parsed.toString())}${path}`}
    >
      {children}
    </BrandLink>
  )
}
