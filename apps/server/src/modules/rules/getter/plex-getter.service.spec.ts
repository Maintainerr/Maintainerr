import { Mocked, TestBed } from '@suites/unit';
import {
  createMediaItem,
  createPlexMetadata,
  createRulesDto,
} from '../../../../test/utils/data';
import { PlexApiService } from '../../../modules/api/plex-api/plex-api.service';
import { PlexGetterService } from './plex-getter.service';

describe('PlexGetterService', () => {
  let plexGetterService: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    plexGetterService = unit;
    plexApi = unitRef.get(PlexApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('viewCount (id: 5)', () => {
    it('should return viewCount from the library item', async () => {
      const mediaItem = createMediaItem({ type: 'movie', viewCount: 3 });
      const metadata = createPlexMetadata({ type: 'movie' });

      plexApi.getMetadata.mockResolvedValue(metadata);

      const response = await plexGetterService.get(
        5,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(3);
    });

    it('should return 0 when viewCount is undefined', async () => {
      const mediaItem = createMediaItem({
        type: 'movie',
        viewCount: undefined,
      });
      const metadata = createPlexMetadata({ type: 'movie' });

      plexApi.getMetadata.mockResolvedValue(metadata);

      const response = await plexGetterService.get(
        5,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(0);
    });

    it('should return 0 when viewCount is null', async () => {
      const mediaItem = createMediaItem({
        type: 'movie',
        viewCount: null as any,
      });
      const metadata = createPlexMetadata({ type: 'movie' });

      plexApi.getMetadata.mockResolvedValue(metadata);

      const response = await plexGetterService.get(
        5,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(0);
    });

    it('should not call getWatchHistory', async () => {
      const mediaItem = createMediaItem({ type: 'movie', viewCount: 1 });
      const metadata = createPlexMetadata({ type: 'movie' });

      plexApi.getMetadata.mockResolvedValue(metadata);

      await plexGetterService.get(
        5,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(plexApi.getWatchHistory).not.toHaveBeenCalled();
    });
  });
});
