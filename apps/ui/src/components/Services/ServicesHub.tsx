import { ChevronRightIcon } from '@heroicons/react/outline'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from 'react-router-dom'
import { prefetchHandlers } from '../../router'
import { useMediaServerSetupNavigationGuard } from '../Layout/MediaServerSetupGuard'
import { serviceTileClass } from './mediaServerOptions'
import ServiceLogo from './ServiceLogo'
import {
  type ServiceGroup,
  type ServiceState,
  useServices,
} from './useServices'

const groupLabels: Record<ServiceGroup, MessageDescriptor> = {
  mediaServer: msg`Media server`,
  requests: msg`Requests`,
  libraryManagers: msg`Library managers`,
  metadata: msg`Metadata`,
  watchStatistics: msg`Watch statistics`,
  downloads: msg`Downloads`,
  notifications: msg`Notifications`,
}

const stateDotClass: Record<ServiceState, string> = {
  ok: 'bg-success-500',
  warning: 'bg-amber-600',
  off: 'bg-zinc-500',
}

const ServicesHub = () => {
  const { t } = useLingui()
  const services = useServices()
  const { isRouteBlocked, showBlockedNavigationToast } =
    useMediaServerSetupNavigationGuard()
  const groups = [...new Set(services.map((service) => service.group))]

  return (
    <>
      <title>{t`Services - Maintainerr`}</title>
      <div className="section">
        <h3 className="heading">
          <Trans>Services</Trans>
        </h3>
        <p className="description text-base leading-6">
          <Trans>
            Connect Maintainerr to your media server and the apps it works with.
          </Trans>
        </p>
      </div>

      {groups.map((group) => (
        <section key={group} className="mt-6 max-w-6xl">
          <h4 className="sm-heading">{t(groupLabels[group])}</h4>
          <ul className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {services
              .filter((service) => service.group === group)
              .map((service) => {
                const blocked = isRouteBlocked(service.route)

                return (
                  <li key={service.key}>
                    <Link
                      to={service.route}
                      aria-disabled={blocked}
                      {...prefetchHandlers(service.route, !blocked)}
                      onClick={(event) => {
                        if (blocked) {
                          event.preventDefault()
                          showBlockedNavigationToast()
                        }
                      }}
                      className={`flex items-center border-zinc-700 bg-zinc-800 ${serviceTileClass} ${
                        blocked
                          ? 'cursor-not-allowed opacity-50'
                          : 'hover:border-zinc-600'
                      }`}
                    >
                      <ServiceLogo
                        logo={service.logo}
                        className="h-10 w-10 shrink-0 rounded-sm"
                      />
                      <div className="ml-4 min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-100">
                          {service.name}
                        </p>
                        <p className="flex min-h-5 items-center gap-1.5 text-sm text-zinc-400">
                          {service.status ? (
                            <>
                              <span
                                aria-hidden
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  stateDotClass[service.state]
                                }`}
                              />
                              {service.status}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-zinc-500" />
                    </Link>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </>
  )
}

export default ServicesHub
