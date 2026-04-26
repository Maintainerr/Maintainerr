import type { AnchorHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

const brandLinkClass = 'text-maintainerr underline hover:text-maintainerr-400'

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  external: true
}

type InternalLinkProps = Omit<LinkProps, 'to'> & {
  external?: false
  to: LinkProps['to']
}

type BrandLinkProps = ExternalLinkProps | InternalLinkProps

const BrandLink = (props: BrandLinkProps) => {
  if (props.external) {
    const { external, className, ...rest } = props
    void external
    return (
      <a
        target="_blank"
        rel="noreferrer"
        className={`${brandLinkClass}${className ? ` ${className}` : ''}`}
        {...rest}
      />
    )
  }

  const { external, className, ...rest } = props
  void external
  return (
    <Link
      className={`${brandLinkClass}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export default BrandLink
