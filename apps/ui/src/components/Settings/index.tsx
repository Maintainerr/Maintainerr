import { Trans, useLingui } from '@lingui/react/macro'
import { useEffect, useState } from 'react'
import {
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
} from 'react-router-dom'
import { useSettings, type UseSettingsResult } from '../../api/settings'
import {
  hasCompletedMediaServerSetup,
  hasSelectedMediaServerType,
} from '../../hooks/useMediaServerType'
import Alert from '../Common/Alert'
import DocsButton from '../Common/DocsButton'
import LoadingSpinner from '../Common/LoadingSpinner'
import Modal from '../Common/Modal'
import {
  bypassMediaServerSetupGuard,
  isAllowedDuringMediaServerSetup,
  mediaServerSetupRoute,
  showMediaServerSetupRequiredToast,
} from '../Layout/MediaServerSetupGuard'
import ServiceLogo from '../Services/ServiceLogo'
import { useServices } from '../Services/useServices'
import SettingsTabs, { SettingsRoute } from './Tabs'

export type SettingsOutletContext = {
  settings: NonNullable<UseSettingsResult['data']>
}

export const useSettingsOutletContext = () =>
  useOutletContext<SettingsOutletContext>()

// Shared by /settings and /services: both need the settings outlet context and
// the same first-setup gating, and differ only in their tab row.
const SettingsWrapper = ({
  section = 'settings',
}: {
  section?: 'settings' | 'services'
}) => {
  const { t } = useLingui()
  const location = useLocation()
  const { data: settings, isLoading, error } = useSettings()
  const services = useServices(section === 'services')
  const [hasDismissedSetupWelcome, setHasDismissedSetupWelcome] =
    useState(false)

  // Rebuilt each render rather than memoized, so a language switch relabels
  // the tabs.
  const settingsRoutes: SettingsRoute[] =
    section === 'services'
      ? services.map((service) => ({
          text: service.name,
          content: (
            <span title={service.name} className="flex">
              <ServiceLogo logo={service.logo} className="h-6 w-6" />
              <span className="sr-only">{service.name}</span>
            </span>
          ),
          route: service.route,
        }))
      : [
          {
            text: t`General`,
            route: '/settings/main',
            regex: /^\/settings\/main$/,
          },
          {
            text: t`Logs`,
            route: '/settings/logs',
            regex: /^\/settings\/logs$/,
          },
          {
            text: t`Jobs`,
            route: '/settings/jobs',
            regex: /^\/settings\/jobs$/,
          },
          {
            text: t`About`,
            route: '/settings/about',
            regex: /^\/settings\/about$/,
          },
        ]
  const activeService = services.find(
    (service) => location.pathname === service.route,
  )
  const tabType = section === 'services' ? 'button' : 'default'
  // The services hub is itself the picker, so only service pages get the row.
  const showTabs = section === 'settings' || location.pathname !== '/services'

  const isMediaServerSetupComplete = hasCompletedMediaServerSetup(settings)
  const hasSelectedMediaServer = hasSelectedMediaServerType(settings)
  const isSetupRestrictedRoute =
    !bypassMediaServerSetupGuard && !isLoading && !isMediaServerSetupComplete
  const isAllowedRoute = isAllowedDuringMediaServerSetup(location.pathname)
  const shouldShowSetupWelcome =
    isSetupRestrictedRoute &&
    !hasSelectedMediaServer &&
    location.pathname.startsWith(mediaServerSetupRoute) &&
    !hasDismissedSetupWelcome

  useEffect(() => {
    if (isSetupRestrictedRoute && !isAllowedRoute) {
      showMediaServerSetupRequiredToast()
    }
  }, [isAllowedRoute, isSetupRestrictedRoute])

  if (error) {
    return (
      <>
        {showTabs ? (
          <div className="mt-6 min-h-10">
            <SettingsTabs
              tabType={tabType}
              settingsRoutes={settingsRoutes}
              allEnabled={false}
            />
          </div>
        ) : null}
        <div className="mt-10 flex">
          <Alert
            type="error"
            title={t`There was a problem loading settings.`}
          />
        </div>
      </>
    )
  }

  if (isLoading) {
    return (
      <>
        {showTabs ? (
          <div className="mt-6 min-h-10">
            <SettingsTabs
              tabType={tabType}
              settingsRoutes={settingsRoutes}
              allEnabled={false}
            />
          </div>
        ) : null}
        <LoadingSpinner />
      </>
    )
  }

  if (isSetupRestrictedRoute && !isAllowedRoute) {
    return <Navigate to={mediaServerSetupRoute} replace />
  }

  // During setup each section opens on the one page that can be used yet.
  if (isSetupRestrictedRoute && location.pathname === '/services') {
    return <Navigate to={mediaServerSetupRoute} replace />
  }
  if (isSetupRestrictedRoute && location.pathname === '/settings') {
    return <Navigate to="/settings/logs" replace />
  }

  if (settings) {
    const routeIsDisabled = (route: SettingsRoute) => {
      return (
        !bypassMediaServerSetupGuard &&
        !isMediaServerSetupComplete &&
        !isAllowedDuringMediaServerSetup(route.route)
      )
    }

    return (
      <>
        {shouldShowSetupWelcome ? (
          <Modal
            title={t`Welcome to Maintainerr!`}
            backgroundClickable={false}
            size="md"
            onCancel={() => setHasDismissedSetupWelcome(true)}
            cancelText={t`Let's get started`}
            cancelButtonType="primary"
          >
            <div className="space-y-4 text-zinc-100">
              <div className="rounded-md border border-info-500/40 bg-info-900/30 p-4 backdrop-blur-sm">
                <p className="text-base font-medium text-info-100">
                  <Trans>Connect your media server to finish setup.</Trans>
                </p>
                <p className="mt-2 leading-6 text-info-200">
                  <Trans>
                    Choose your media server, confirm the connection, and then
                    you can continue configuring the rest of Maintainerr.
                  </Trans>
                </p>
              </div>
              <p className="text-sm leading-6 text-zinc-400">
                <Trans>
                  Once connected, adding a TVDB API key under Services, Metadata
                  is highly recommended. When the primary provider cannot match
                  a movie or show, Maintainerr falls back to TVDB for its IDs
                  and details.
                </Trans>
              </p>
              <p className="text-sm leading-6 text-zinc-400">
                <Trans>
                  The Logs page stays available during setup if you need to
                  troubleshoot your connection.
                </Trans>
              </p>
            </div>
          </Modal>
        ) : null}
        {showTabs ? (
          <div className="mt-6 min-h-10">
            <SettingsTabs
              tabType={tabType}
              settingsRoutes={settingsRoutes}
              allEnabled
              isRouteDisabled={routeIsDisabled}
            />
          </div>
        ) : null}
        {activeService ? (
          <div className="mt-8 max-w-6xl">
            <h3 className="heading">{activeService.name}</h3>
            <p className="description text-base leading-6">
              {activeService.description}
            </p>
            <div className="mt-3">
              <DocsButton page={activeService.docsPage} />
            </div>
          </div>
        ) : null}
        <div className={`${activeService ? 'mt-6' : 'mt-10'} text-white`}>
          <Outlet context={{ settings }} />
        </div>
      </>
    )
  }

  return null
}
export default SettingsWrapper
