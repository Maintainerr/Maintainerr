import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { chunk } from 'lodash';

// Seasons are read a few at a time. One read per season would cost a
// long-running show a round trip per season on the rule-evaluation path, while
// an unbounded fan-out multiplies with the evaluator's own concurrency.
export const SEASON_READ_CONCURRENCY = 5;

/**
 * Every descendant of an item, depth first: a show's seasons and their
 * episodes, a season's episodes. Anything else has none.
 */
export const resolveDescendants = async (
  item: { type: MediaItemType; id: string },
  getChildren: (parentId: string, type: MediaItemType) => Promise<MediaItem[]>,
): Promise<MediaItem[]> => {
  if (item.type === 'season') return getChildren(item.id, 'episode');
  if (item.type !== 'show') return [];

  const seasons = await getChildren(item.id, 'season');
  const descendants: MediaItem[] = [];
  for (const batch of chunk(seasons, SEASON_READ_CONCURRENCY)) {
    const episodes = await Promise.all(
      batch.map((season) => getChildren(season.id, 'episode')),
    );
    batch.forEach((season, index) =>
      descendants.push(season, ...episodes[index]),
    );
  }
  return descendants;
};

/**
 * Resolve which media server ids a context action (exclusion, manual add or
 * remove) should apply to, given the collection's media type and the item the
 * user acted on.
 *
 * Shared by every media server: the traversal is the same show -> season ->
 * episode walk, only the `getChildren` lookup behind it differs.
 *
 * `getChildren` must throw on a failed read rather than answer an empty list:
 * the walk cannot tell the two apart, so a swallowed failure silently drops the
 * expansion and the action is reported as done.
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
  const cascade =
    context.type === 'season' || context.type === 'episode'
      ? { type: context.type, id: context.id }
      : { type: context.type, id: mediaId };

  handleMedia.push(cascade.id);
  for (const descendant of await resolveDescendants(cascade, getChildren)) {
    handleMedia.push(descendant.id);
  }

  return handleMedia;
};
