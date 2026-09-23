import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { createMediaItem, createMockLogger } from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import {
  OmbiApiService,
  OmbiChildRequest,
  OmbiMovieRequest,
  OmbiSeasonRequest,
  OmbiTvRequest,
} from '../../api/ombi-api/ombi-api.service';
import { MetadataService } from '../../metadata/metadata.service';
import { OmbiGetterService } from './ombi-getter.service';

describe('OmbiGetterService', () => {
  const ADD_USER = 0;
  const REQUEST_DATE = 1;
  const RELEASE_DATE = 2;
  const APPROVAL_DATE = 3;
  const MEDIA_ADDED_AT = 4;
  const AMOUNT_REQUESTED = 5;
  const IS_REQUESTED = 6;

  const movieLibItem = createMediaItem({ type: 'movie' });
  const showLibItem = createMediaItem({ type: 'show' });
  const seasonLibItem = createMediaItem({
    type: 'season',
    parentId: showLibItem.id,
    index: 2,
  });
  const episodeLibItem = createMediaItem({
    type: 'episode',
    grandparentId: showLibItem.id,
    parentIndex: 2,
    index: 3,
  });

  const movie = (
    overrides: Partial<OmbiMovieRequest> = {},
  ): OmbiMovieRequest => ({
    id: 1,
    theMovieDbId: 100,
    title: 'Sample Movie',
    approved: true,
    markedAsApproved: '2026-01-02T00:00:00Z',
    requestedDate: '2026-01-01T00:00:00Z',
    available: true,
    markedAsAvailable: '2026-01-03T00:00:00Z',
    denied: false,
    releaseDate: '2020-01-01T00:00:00Z',
    has4KRequest: false,
    requestedDate4k: '0001-01-01T00:00:00Z',
    requestedByAlias: null,
    requestedUser: { userName: 'alice' },
    ...overrides,
  });

  // Episode air dates land on month `seasonNumber`, day `episodeNumber`.
  const season = (
    seasonNumber: number,
    episodes: number[],
  ): OmbiSeasonRequest => ({
    seasonNumber,
    episodes: episodes.map((episodeNumber) => ({
      episodeNumber,
      airDate: new Date(
        Date.UTC(2020, seasonNumber, episodeNumber),
      ).toISOString(),
      available: false,
    })),
  });

  const child = (
    seasonRequests: OmbiSeasonRequest[],
    overrides: Partial<OmbiChildRequest> = {},
  ): OmbiChildRequest => ({
    id: 10,
    parentRequestId: 5,
    approved: true,
    markedAsApproved: '0001-01-01T00:00:00Z',
    requestedDate: '2026-01-01T00:00:00Z',
    available: false,
    markedAsAvailable: null,
    denied: null,
    requestedByAlias: null,
    requestedUser: { userName: 'bob' },
    seasonRequests,
    ...overrides,
  });

  const show = (childRequests: OmbiChildRequest[]): OmbiTvRequest => ({
    id: 5,
    tvDbId: 1,
    externalProviderId: 200,
    title: 'Sample Series',
    releaseDate: '2019-01-01T00:00:00Z',
    childRequests,
  });

  const createService = () => {
    const ombiApi = {
      getMovieRequest: jest.fn(),
      getShowRequest: jest.fn(),
    } as unknown as jest.Mocked<OmbiApiService>;
    const getMetadata = jest.fn().mockResolvedValue(showLibItem);
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({ getMetadata }),
    } as unknown as jest.Mocked<MediaServerFactory>;
    const metadataService = {
      resolveIdsFromMediaItemForService: jest
        .fn()
        .mockResolvedValue({ tmdb: 100 }),
    } as unknown as jest.Mocked<MetadataService>;

    const service = new OmbiGetterService(
      ombiApi,
      mediaServerFactory,
      metadataService,
      createMockLogger(),
    );
    const get = (id: number, item: MediaItem, dataType?: MediaItemType) =>
      service.get(id, item, dataType);

    return { get, ombiApi, metadataService, getMetadata };
  };

  describe('movies', () => {
    it('derives every property from the one request', async () => {
      const { get, ombiApi } = createService();
      ombiApi.getMovieRequest.mockResolvedValue(
        movie({ requestedByAlias: 'discord-dave' }),
      );

      expect(await get(ADD_USER, movieLibItem)).toEqual(['discord-dave']);
      expect(await get(REQUEST_DATE, movieLibItem)).toEqual(
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(await get(RELEASE_DATE, movieLibItem)).toEqual(
        new Date('2020-01-01T00:00:00Z'),
      );
      expect(await get(APPROVAL_DATE, movieLibItem)).toEqual(
        new Date('2026-01-02T00:00:00Z'),
      );
      expect(await get(MEDIA_ADDED_AT, movieLibItem)).toEqual(
        new Date('2026-01-03T00:00:00Z'),
      );
      expect(await get(AMOUNT_REQUESTED, movieLibItem)).toBe(1);
      expect(await get(IS_REQUESTED, movieLibItem)).toBe(1);
    });

    it('answers definitively for a title Ombi holds no request for', async () => {
      const { get, ombiApi } = createService();
      ombiApi.getMovieRequest.mockResolvedValue(null);

      expect(await get(ADD_USER, movieLibItem)).toEqual([]);
      expect(await get(REQUEST_DATE, movieLibItem)).toBeNull();
      expect(await get(RELEASE_DATE, movieLibItem)).toBeNull();
      expect(await get(AMOUNT_REQUESTED, movieLibItem)).toBe(0);
      expect(await get(IS_REQUESTED, movieLibItem)).toBe(0);
    });

    it('reads a year-1 stamp as unset and a 4K-only request from its own date', async () => {
      const { get, ombiApi } = createService();
      ombiApi.getMovieRequest.mockResolvedValue(
        movie({
          requestedDate: '0001-01-01T00:00:00Z',
          requestedDate4k: '2026-02-01T00:00:00Z',
          markedAsApproved: '0001-01-01T00:00:00Z',
        }),
      );

      expect(await get(REQUEST_DATE, movieLibItem)).toEqual(
        new Date('2026-02-01T00:00:00Z'),
      );
      // Approved without a stamp: auto-approval, so the request date stands in.
      expect(await get(APPROVAL_DATE, movieLibItem)).toEqual(
        new Date('2026-02-01T00:00:00Z'),
      );
    });

    it('skips the item when the sweep failed or the id cannot be resolved', async () => {
      const { get, ombiApi, metadataService } = createService();
      ombiApi.getMovieRequest.mockResolvedValue(undefined);
      expect(await get(IS_REQUESTED, movieLibItem)).toBeUndefined();

      metadataService.resolveIdsFromMediaItemForService.mockResolvedValue(
        undefined,
      );
      expect(await get(IS_REQUESTED, movieLibItem)).toBeUndefined();
      expect(ombiApi.getMovieRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('shows', () => {
    const newer = child([season(1, [1, 2])], {
      requestedDate: '2026-01-05T00:00:00Z',
      requestedUser: { userName: 'alice' },
      markedAsApproved: '2026-01-05T01:00:00Z',
      available: true,
      markedAsAvailable: '2026-01-06T00:00:00Z',
    });
    const older = child([season(2, [1, 2, 3])], {
      id: 11,
      requestedDate: '2026-01-01T00:00:00Z',
    });

    it('reads the whole show from every child request, oldest first', async () => {
      const { get, ombiApi } = createService();
      ombiApi.getShowRequest.mockResolvedValue(show([newer, older]));

      expect(await get(ADD_USER, showLibItem)).toEqual(['bob', 'alice']);
      expect(await get(REQUEST_DATE, showLibItem)).toEqual(
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(await get(RELEASE_DATE, showLibItem)).toEqual(
        new Date('2019-01-01T00:00:00Z'),
      );
      // The older child was auto-approved (no stamp), so its request date
      // stands in and is the earliest approval.
      expect(await get(APPROVAL_DATE, showLibItem)).toEqual(
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(await get(MEDIA_ADDED_AT, showLibItem)).toEqual(
        new Date('2026-01-06T00:00:00Z'),
      );
      expect(await get(AMOUNT_REQUESTED, showLibItem)).toBe(2);
    });

    it('scopes a season to the child requests covering it', async () => {
      const { get, ombiApi, getMetadata } = createService();
      ombiApi.getShowRequest.mockResolvedValue(show([newer, older]));

      expect(await get(ADD_USER, seasonLibItem, 'season')).toEqual(['bob']);
      expect(await get(AMOUNT_REQUESTED, seasonLibItem, 'season')).toBe(1);
      expect(await get(RELEASE_DATE, seasonLibItem, 'season')).toEqual(
        new Date(Date.UTC(2020, 2, 1)),
      );
      expect(getMetadata).toHaveBeenCalledWith(showLibItem.id);

      const unrequested = createMediaItem({
        type: 'season',
        parentId: showLibItem.id,
        index: 3,
      });
      expect(await get(IS_REQUESTED, unrequested, 'season')).toBe(0);
      expect(await get(ADD_USER, unrequested, 'season')).toEqual([]);
    });

    it('resolves an episode through its show and answers its own air date', async () => {
      const { get, ombiApi, getMetadata } = createService();
      ombiApi.getShowRequest.mockResolvedValue(show([older]));

      expect(await get(RELEASE_DATE, episodeLibItem, 'episode')).toEqual(
        new Date(Date.UTC(2020, 2, 3)),
      );
      expect(await get(IS_REQUESTED, episodeLibItem, 'episode')).toBe(1);
      expect(getMetadata).toHaveBeenCalledWith(showLibItem.id);
    });
  });
});
