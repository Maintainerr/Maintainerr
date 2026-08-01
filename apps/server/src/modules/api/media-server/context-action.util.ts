import { MediaItem, MediaItemType } from '@maintainerr/contracts';

/**
 * Resolve which media server ids a context action (exclusion, manual add or
 * remove) should apply to, given the collection's media type and the item the
 * user acted on.
 *
 * Shared by every media server: the traversal is the same show -> season ->
 * episode walk, only the `getChildren` lookup behind it differs.
 *
 * `context.id` is always a real media server id. Do not add a "whole item"
 * sentinel case: short-circuiting on one is what handed a show's id to a season
 * collection for Plex to reject with a 400 (#3381). A context that names no
 * season or episode is expressed by `context.type`, which the switches below
 * resolve from `mediaId`.
 */
export const resolveContextActionIds = async (
  collectionType: MediaItemType | undefined,
  context: { type: MediaItemType; id: string },
  mediaId: string,
  getChildren: (parentId: string, type: MediaItemType) => Promise<MediaItem[]>,
  onUnsupported?: (message: string) => void,
): Promise<string[]> => {
  const handleMedia: string[] = [];
  const childIds = async (parentId: string, type: MediaItemType) =>
    (await getChildren(parentId, type)).map((child) => child.id);

  if (collectionType) {
    switch (collectionType) {
      case 'season':
        switch (context.type) {
          case 'season':
            handleMedia.push(context.id);
            break;
          case 'episode':
            onUnsupported?.(
              'Tried to add episodes to a collection of type season. This is not allowed.',
            );
            break;
          default:
            handleMedia.push(...(await childIds(mediaId, 'season')));
            break;
        }
        break;

      case 'episode':
        switch (context.type) {
          case 'season':
            handleMedia.push(...(await childIds(context.id, 'episode')));
            break;
          case 'episode':
            handleMedia.push(context.id);
            break;
          default:
            for (const seasonId of await childIds(mediaId, 'season')) {
              handleMedia.push(...(await childIds(seasonId, 'episode')));
            }
            break;
        }
        break;

      // show or movie collections act on the item itself
      default:
        handleMedia.push(mediaId);
        break;
    }

    return handleMedia;
  }

  // No collection type: a global exclusion, which cascades down the hierarchy.
  switch (context.type) {
    case 'show':
      handleMedia.push(mediaId);
      for (const seasonId of await childIds(mediaId, 'season')) {
        handleMedia.push(seasonId);
        handleMedia.push(...(await childIds(seasonId, 'episode')));
      }
      break;
    case 'season':
      handleMedia.push(context.id);
      handleMedia.push(...(await childIds(context.id, 'episode')));
      break;
    case 'episode':
      handleMedia.push(context.id);
      break;
    default:
      handleMedia.push(mediaId);
      break;
  }

  return handleMedia;
};
