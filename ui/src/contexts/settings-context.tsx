import {
  createContext,
  ReactElement,
  ReactNode,
  ReactPortal,
  useState,
} from 'react'

export interface ISettings {
  id: number
  clientId: string
  applicationTitle: string
  applicationUrl: string
  apikey: string
  overseerr_url: string
  locale: string
  cacheImages: number
  plex_name: string
  plex_hostname: string
  plex_port: number
  plex_ssl: number
  plex_auth_token: string | null
  plex_default_library: number | null
  overseerr_api_key: string
  tautulli_url: string
  tautulli_api_key: string
  jellyseerr_url: string
  jellyseerr_api_key: string
  collection_handler_job_cron: string
  rules_handler_job_cron: string
}

const SettingsContext = createContext({
  settings: {} as ISettings,
  addSettings: (settings: ISettings) => {},
  removeSettings: () => {},
})

export function SettingsContextProvider(props: {
  children:
    | boolean
    | ReactElement<any>
    | number
    | string
    | Iterable<ReactNode>
    | ReactPortal
    | null
    | undefined
}) {
  const [settings, setSettings] = useState<ISettings>({} as ISettings)

  function addSettingsHandler(settings: ISettings) {
    setSettings(() => {
      return settings
    })
  }
  function removeSettingsHandler() {
    setSettings(() => {
      return {} as ISettings
    })
  }

  const context: {
    settings: ISettings
    addSettings: (settings: ISettings) => void
    removeSettings: () => void
  } = {
    settings: settings,
    addSettings: addSettingsHandler,
    removeSettings: removeSettingsHandler,
  }

  return (
    <SettingsContext.Provider value={context}>
      {props.children}
    </SettingsContext.Provider>
  )
}

export default SettingsContext
