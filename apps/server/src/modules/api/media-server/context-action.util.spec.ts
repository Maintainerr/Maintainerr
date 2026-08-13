import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import {
  resolveContextActionIds,
  resolveDescendants,
  SEASON_READ_CONCURRENCY,
} from './context-action.util';

describe('resolveDescendants', () => {
  // More seasons than one batch holds, so the order across batches and the
  // in-flight cap are both exercised.
  const seasonCount = SEASON_READ_CONCURRENCY + 2;

  it('keeps depth-first order while capping the season reads in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const getChildren = async (parentId: string, type: MediaItemType) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight--;
      return type === 'season'
        ? Array.from(
            { length: seasonCount },
            (_, index) => ({ id: `s${index}` }) as MediaItem,
          )
        : [{ id: `${parentId}e` } as MediaItem];
    };

    const descendants = await resolveDescendants(
      { type: 'show', id: 'series' },
      getChildren,
    );

    expect(descendants.map((item) => item.id)).toEqual(
      Array.from({ length: seasonCount }, (_, index) => [
        `s${index}`,
        `s${index}e`,
      ]).flat(),
    );
    expect(maxInFlight).toBe(SEASON_READ_CONCURRENCY);
  });
});

describe('resolveContextActionIds', () => {
  // show 'series' -> season 's1' -> episodes 'e1','e2'
  const children = (parentId: string, type: MediaItemType): MediaItem[] => {
    if (type === 'season' && parentId === 'series')
      return [{ id: 's1' } as MediaItem];
    if (type === 'episode' && parentId === 's1')
      return [{ id: 'e1' } as MediaItem, { id: 'e2' } as MediaItem];
    return [];
  };
  const get = jest.fn(async (p: string, t: MediaItemType) => children(p, t));

  beforeEach(() => get.mockClear());

  // Emby returned [mediaId] here, so excluding one season excluded the whole
  // show. A global exclusion cascades from the item acted on, not the top one.
  it('cascades a global season exclusion to the season and its episodes', async () => {
    expect(
      await resolveContextActionIds(
        undefined,
        { type: 'season', id: 's1' },
        'series',
        get,
      ),
    ).toEqual(['s1', 'e1', 'e2']);
  });

  it('cascades a global show exclusion through every level', async () => {
    expect(
      await resolveContextActionIds(
        undefined,
        { type: 'show', id: 'series' },
        'series',
        get,
      ),
    ).toEqual(['series', 's1', 'e1', 'e2']);
  });

  it('returns only the episode for a global episode exclusion', async () => {
    expect(
      await resolveContextActionIds(
        undefined,
        { type: 'episode', id: 'e2' },
        'series',
        get,
      ),
    ).toEqual(['e2']);
  });

  it('expands a season context to its episodes for an episode collection', async () => {
    expect(
      await resolveContextActionIds(
        'episode',
        { type: 'season', id: 's1' },
        'series',
        get,
      ),
    ).toEqual(['e1', 'e2']);
  });

  // Both show cases used to return the show's own id, which Plex rejects with
  // a 400 when the collection holds seasons or episodes (#3381).
  it('expands a show context to every season for a season collection', async () => {
    expect(
      await resolveContextActionIds(
        'season',
        { type: 'show', id: 'series' },
        'series',
        get,
      ),
    ).toEqual(['s1']);
  });

  it('expands a show context to every episode for an episode collection', async () => {
    expect(
      await resolveContextActionIds(
        'episode',
        { type: 'show', id: 'series' },
        'series',
        get,
      ),
    ).toEqual(['e1', 'e2']);
  });

  it('reports episodes into a season collection as unsupported', async () => {
    const onUnsupported = jest.fn();
    expect(
      await resolveContextActionIds(
        'season',
        { type: 'episode', id: 'e1' },
        'series',
        get,
        onUnsupported,
      ),
    ).toEqual([]);
    expect(onUnsupported).toHaveBeenCalled();
  });

  it('acts on the item itself for show and movie collections', async () => {
    expect(
      await resolveContextActionIds(
        'show',
        { type: 'show', id: 'series' },
        'm',
        get,
      ),
    ).toEqual(['m']);
    expect(
      await resolveContextActionIds(
        'movie',
        { type: 'movie', id: 'x' },
        'm',
        get,
      ),
    ).toEqual(['m']);
  });
});
