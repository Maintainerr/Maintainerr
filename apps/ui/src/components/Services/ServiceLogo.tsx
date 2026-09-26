import type { Service } from './useServices'

const ServiceLogo = ({
  logo,
  className,
}: {
  logo: Service['logo']
  className: string
}) => {
  if (typeof logo === 'string') {
    return <img src={logo} alt="" className={`${className} object-contain`} />
  }

  const Icon = logo
  return <Icon className={`${className} text-zinc-200`} />
}

export default ServiceLogo
