import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { MediaServerType } from '@maintainerr/contracts'

const basePath = import.meta.env.VITE_BASE_PATH ?? ''

export const serviceLogo = (file: string) => `${basePath}/icons_logos/${file}`

// The tile both the services hub and the media server picker are built from.
export const serviceTileClass =
  'rounded-lg border p-4 shadow-xs transition-colors duration-150 focus:ring-2 focus:ring-maintainerr focus:outline-hidden'

export const mediaServerOptions: {
  value: MediaServerType
  name: string
  description: MessageDescriptor
  icon: string
}[] = [
  {
    value: MediaServerType.PLEX,
    name: 'Plex',
    description: msg`Plex Media Server`,
    icon: serviceLogo('plex_logo.svg'),
  },
  {
    value: MediaServerType.JELLYFIN,
    name: 'Jellyfin',
    description: msg`Jellyfin Media Server`,
    icon: serviceLogo('jellyfin.svg'),
  },
  {
    value: MediaServerType.EMBY,
    name: 'Emby',
    description: msg`Emby Media Server`,
    icon: serviceLogo('emby.png'),
  },
]
