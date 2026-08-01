import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { resolveContextActionIds } from './context-action.util';

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
