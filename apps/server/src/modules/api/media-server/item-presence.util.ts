import { MediaItem } from '@maintainerr/contracts';
import { IMediaServerService } from './media-server.interface';

export interface ItemPresence {
  /** Items the server answered with, by id. */
  found: Map<string, MediaItem>;
  /** Ids confirmed gone. An id in neither set could not be checked. */
  missing: Set<string>;
}

/**
 * Which of these ids a media server still holds, and which it confirms are gone.
 *
 * One batched read clears the ids still answered for; the rest are checked one
 * at a time, because `itemExists` is the only read that separates "gone" from
 * "could not ask" - an id absent from a batch means either. So a caller's
 * removals stay gated by that confirmation, they just no longer cost a request
 * per item that is plainly still there.
 */
export const readItemPresence = async (
  mediaServer: IMediaServerService,
  itemIds: string[],
  onInconclusive: (error: unknown) => void,
): Promise<ItemPresence> => {
  const found = new Map<string, MediaItem>();
  const missing = new Set<string>();

  if (itemIds.length === 0) {
    return { found, missing };
  }

  try {
    for (const item of await mediaServer.getMetadataBatch(itemIds)) {
      found.set(item.id, item);
    }
  } catch (error) {
    // Leaves every id to the per-item check below, as before batching.
    onInconclusive(error);
  }

  for (const itemId of new Set(itemIds)) {
    if (found.has(itemId)) continue;

    try {
      if (!(await mediaServer.itemExists(itemId))) {
        missing.add(itemId);
      }
    } catch (error) {
      onInconclusive(error);
    }
  }

  return { found, missing };
};
