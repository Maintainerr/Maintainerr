import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createMediaItem } from '../../../../test/utils/data';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { PlexSeenBy } from '../../api/plex-api/interfaces/library.interfaces';
import { PlexMetadata } from '../../api/plex-api/interfaces/media.interface';
import { MaintainerrLogger } from '../../logging/logs.service';
import { PlexGetterService } from './plex-getter.service';

const VIEWCOUNT_PROP_ID = 5;
const ISWATCHED_PROP_ID = 43;

const makeMetadata = (overrides: Partial<PlexMetadata> = {}): PlexMetadata =>
  ({
    ratingKey: '12345',
    type: 'movie',
    ...overrides,
  }) as PlexMetadata;

const makeSeenBy = (count: number): PlexSeenBy[] =>
  Array.from({ length: count }, (_, i) => ({
    accountID: i,
    historyKey: `/status/sessions/history/${i}`,
    key: `/library/metadata/${i}`,
    ratingKey: '12345',
    title: `View ${i}`,
    thumb: '',
  })) as unknown as PlexSeenBy[];

describe('PlexGetterService', () => {
  let service: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    service = unit;
    plexApi = unitRef.get(PlexApiService);
    logger = unitRef.get(MaintainerrLogger);
  });

  describe('viewCount', () => {
    let libItem: MediaItem;

    beforeEach(() => {
      libItem = createMediaItem({ type: 'movie', viewCount: 0 });
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
    });

    it('should use watch history count when history returns entries', async () => {
      plexApi.getWatchHistory.mockResolvedValue(makeSeenBy(7));

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(7);
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('12345');
    });

    it('should fall back to libItem.viewCount when history is empty but viewCount > 0', async () => {
      libItem.viewCount = 3;
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(3);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('viewCount fallback'),
      );
    });

    it('should return 0 when history is empty and libItem.viewCount is 0', async () => {
      libItem.viewCount = 0;
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(0);
    });

    it('should fall back to libItem.viewCount when watch history API fails', async () => {
      libItem.viewCount = 5;
      plexApi.getWatchHistory.mockRejectedValue(new Error('API error'));

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(5);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('viewCount fallback'),
      );
    });

    it('should return 0 when watch history API fails and libItem.viewCount is 0', async () => {
      libItem.viewCount = 0;
      plexApi.getWatchHistory.mockRejectedValue(new Error('API error'));

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(0);
    });
  });

  describe('isWatched', () => {
    let libItem: MediaItem;

    beforeEach(() => {
      libItem = createMediaItem({ type: 'movie', viewCount: 0 });
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
    });

    it('should return true when watch history has entries', async () => {
      plexApi.getWatchHistory.mockResolvedValue(makeSeenBy(3));

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(true);
    });

    it('should return true when history is empty but libItem.viewCount > 0', async () => {
      libItem.viewCount = 2;
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(true);
    });

    it('should return false when history is empty and libItem.viewCount is 0', async () => {
      libItem.viewCount = 0;
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
    });

    it('should return true when history API fails but libItem.viewCount > 0', async () => {
      libItem.viewCount = 1;
      plexApi.getWatchHistory.mockRejectedValue(new Error('API error'));

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(true);
    });

    it('should return false when history API fails and libItem.viewCount is 0', async () => {
      libItem.viewCount = 0;
      plexApi.getWatchHistory.mockRejectedValue(new Error('API error'));

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
    });
  });
});
