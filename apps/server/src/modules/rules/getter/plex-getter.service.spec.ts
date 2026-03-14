import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createMediaItem } from '../../../../test/utils/data';
import { PlexAdapterService } from '../../api/media-server/plex/plex-adapter.service';
import { PlexMetadata } from '../../api/plex-api/interfaces/media.interface';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { PlexGetterService } from './plex-getter.service';

const VIEWCOUNT_PROP_ID = 5;
const ISWATCHED_PROP_ID = 43;

const makeMetadata = (overrides: Partial<PlexMetadata> = {}): PlexMetadata =>
  ({
    ratingKey: '12345',
    type: 'movie',
    ...overrides,
  }) as PlexMetadata;

describe('PlexGetterService', () => {
  let service: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;
  let plexAdapter: Mocked<PlexAdapterService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    service = unit;
    plexApi = unitRef.get(PlexApiService);
    plexAdapter = unitRef.get(PlexAdapterService);
  });

  describe('watch state rules', () => {
    let libItem: MediaItem;

    beforeEach(() => {
      libItem = createMediaItem({ type: 'movie', viewCount: 0 });
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
    });

    it('should return the adapter view count for the viewCount rule', async () => {
      plexAdapter.getWatchState.mockResolvedValue({
        viewCount: 7,
        isWatched: true,
      });

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(7);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith('12345');
    });

    it('should return the adapter watched state for the isWatched rule', async () => {
      plexAdapter.getWatchState.mockResolvedValue({
        viewCount: 0,
        isWatched: false,
      });

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith('12345');
    });
  });
});
