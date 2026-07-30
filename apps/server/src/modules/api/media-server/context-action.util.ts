import { MediaItem, MediaItemType } from '@maintainerr/contracts';

/**
 * Resolve which media server ids a context action (exclusion, manual add or
 * remove) should apply to, given the collection's media type and the item the
 * user acted on.
 *
 * Jellyfin and Emby resolve this identically - both walk show -> season ->
 * episode through `getChildrenMetadata` - so the traversal lives here rather
 * than being duplicated per adapter. Plex has its own implementation because it
 * resolves the hierarchy through the Plex API instead.
 */
export const resolveContextActionIds = async (
  collectionType: MediaItemType | undefined,
  context: { type: MediaItemType; id: string },
  mediaId: string,
  getChildren: (parentId: string, type: MediaItemType) => Promise<MediaItem[]>,
  onUnsupported?: (message: string) => void,
): Promise<string[]> => {
  // -1 is the UI's "all" sentinel.
  if (context.id === '-1') {
    return [mediaId];
  }

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
