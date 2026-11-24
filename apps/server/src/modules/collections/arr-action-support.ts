import {
  MediaItemType,
  ServarrAction,
  ServarrActionManager,
  servarrActionManager,
  supportedServarrActions,
} from '@maintainerr/contracts';
import { BadRequestException } from '@nestjs/common';

const MANAGER_NAMES: Record<ServarrActionManager, string> = {
  radarr: 'Radarr',
  sonarr: 'Sonarr',
  sportarr: 'Sportarr',
};

/**
 * Rejects an action the collection's *arr, or the media server without one,
 * cannot take for its media type. Saved, it would be refused on every run and
 * the collection's items never handled (#4137).
 */
export const assertSupportedArrAction = (collection: {
  type: MediaItemType;
  arrAction: ServarrAction;
  radarrSettingsId?: number | null;
  sonarrSettingsId?: number | null;
  sportarrSettingsId?: number | null;
}): void => {
  const manager = servarrActionManager(collection.type, collection);
  const supported = supportedServarrActions(collection.type, manager);
  if (supported.includes(collection.arrAction)) {
    return;
  }

  const owner = manager
    ? `managed by ${MANAGER_NAMES[manager]}`
    : 'without an *arr server';
  throw new BadRequestException(
    `${ServarrAction[collection.arrAction] ?? collection.arrAction} is not supported for ${collection.type} collections ${owner}. Supported: ${supported.map((action) => ServarrAction[action]).join(', ') || 'none'}`,
  );
};
