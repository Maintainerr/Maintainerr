import { MediaItem, MediaServerFeature } from '@maintainerr/contracts';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MediaItemEnrichmentService } from './media-item-enrichment.service';
import { MediaServerController } from './media-server.controller';
import { MediaServerFactory } from './media-server.factory';
import { IMediaServerService } from './media-server.interface';

/**
 * MediaServerController Tests
 *
 * These tests focus on actual logic in the controller:
 * - Pagination offset calculation
 * - Input validation for visibility settings
 *
 * Pass-through methods (getUsers, getLibraries, etc.) are not tested
 * as they contain no logic - they just delegate to the service.
 */
describe('MediaServerController', () => {
  let controller: MediaServerController;
  let mockMediaServerFactory: jest.Mocked<MediaServerFactory>;
  let mockMediaServerService: jest.Mocked<IMediaServerService>;
  let logger: jest.Mocked<MaintainerrLogger>;
  let mediaItemEnrichmentService: jest.Mocked<MediaItemEnrichmentService>;

  beforeEach(() => {
    mockMediaServerService = {
      getLibraries: jest.fn().mockResolvedValue([]),
      getStatus: jest.fn().mockResolvedValue(undefined),
      getLibraryContents: jest.fn().mockResolvedValue({
        items: [],
        totalSize: 0,
        offset: 0,
        limit: 50,
      }),
      searchContent: jest.fn().mockResolvedValue([]),
      searchLibraryContents: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue(undefined),
      isSetup: jest.fn().mockReturnValue(false),
      supportsFeature: jest.fn().mockReturnValue(false),
      updateCollectionVisibility: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IMediaServerService>;

    mockMediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mockMediaServerService),
    } as unknown as jest.Mocked<MediaServerFactory>;

    logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
    } as unknown as jest.Mocked<MaintainerrLogger>;

    mediaItemEnrichmentService = {
      enrichItems: jest.fn().mockImplementation(async (items) => items),
      getMaintainerrStatusDetails: jest.fn().mockResolvedValue({
        excludedFrom: [],
        manuallyAddedTo: [],
      }),
    } as unknown as jest.Mocked<MediaItemEnrichmentService>;

    controller = new MediaServerController(
      mockMediaServerFactory,
      logger,
      mediaItemEnrichmentService,
    );
  });

  describe('getLibraryContent - Pagination Logic', () => {
    it('should use default pagination (page 1, limit 50, offset 0)', async () => {
      await controller.getLibraryContent('lib1');

      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'lib1',
        { offset: 0, limit: 50, type: undefined },
      );
      expect(mediaItemEnrichmentService.enrichItems).toHaveBeenCalledWith([]);
    });

    it('should calculate offset correctly for page 3 with limit 25', async () => {
      await controller.getLibraryContent('lib1', 3, 25);

      // offset = (page - 1) * limit = (3 - 1) * 25 = 50
      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'lib1',
        { offset: 50, limit: 25, type: undefined },
      );
    });

    it('passes studio sorting to a supporting media server', async () => {
      mockMediaServerService.supportsFeature.mockReturnValue(true);

      await controller.getLibraryContent(
        'lib1',
        1,
        50,
        'movie',
        'studio',
        'asc',
      );

      expect(mockMediaServerService.supportsFeature).toHaveBeenCalledWith(
        MediaServerFeature.LIBRARY_STUDIO_SORT,
      );
      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'lib1',
        {
          offset: 0,
          limit: 50,
          type: 'movie',
          sort: 'studio',
          sortOrder: 'asc',
        },
      );
    });

    it('rejects studio sorting on a media server without native support', async () => {
      mockMediaServerService.supportsFeature.mockReturnValue(false);

      await expect(
        controller.getLibraryContent('lib1', 1, 50, 'movie', 'studio', 'asc'),
      ).rejects.toThrow(
        'Studio sorting is not supported by the configured media server.',
      );
      expect(mockMediaServerService.getLibraryContents).not.toHaveBeenCalled();
    });

    it('should sort excluded items server-side before paging', async () => {
      const alpha = {
        id: '1',
        title: 'Alpha',
        guid: 'guid-1',
        type: 'show',
        addedAt: new Date(),
        providerIds: {},
        mediaSources: [],
        library: { id: 'lib1', title: 'Shows' },
      } satisfies MediaItem;
      const zulu = {
        id: '2',
        title: 'Zulu',
        guid: 'guid-2',
        type: 'show',
        addedAt: new Date(),
        providerIds: {},
        mediaSources: [],
        library: { id: 'lib1', title: 'Shows' },
      } satisfies MediaItem;
      const bravo = {
        id: '3',
        title: 'Bravo',
        guid: 'guid-3',
        type: 'show',
        addedAt: new Date(),
        providerIds: {},
        mediaSources: [],
        library: { id: 'lib1', title: 'Shows' },
      } satisfies MediaItem;

      mockMediaServerService.getLibraryContents
        .mockResolvedValueOnce({
          items: [alpha, zulu],
          totalSize: 3,
          offset: 0,
          limit: 250,
        })
        .mockResolvedValueOnce({
          items: [bravo],
          totalSize: 3,
          offset: 2,
          limit: 250,
        });

      mediaItemEnrichmentService.enrichItems.mockResolvedValueOnce([
        alpha,
        { ...zulu, maintainerrExclusionId: 42 },
        { ...bravo, maintainerrExclusionId: 84 },
      ]);

      const result = await controller.getLibraryContent(
        'lib1',
        1,
        2,
        'show',
        'excluded',
        'desc',
      );

      expect(mockMediaServerService.getLibraryContents).toHaveBeenNthCalledWith(
        1,
        'lib1',
        {
          offset: 0,
          limit: 250,
          type: 'show',
          sort: 'title',
          sortOrder: 'asc',
        },
      );
      expect(mockMediaServerService.getLibraryContents).toHaveBeenNthCalledWith(
        2,
        'lib1',
        {
          offset: 2,
          limit: 250,
          type: 'show',
          sort: 'title',
          sortOrder: 'asc',
        },
      );
      expect(mediaItemEnrichmentService.enrichItems).toHaveBeenCalledWith([
        alpha,
        zulu,
        bravo,
      ]);
      expect(result).toEqual({
        items: [
          { ...zulu, maintainerrExclusionId: 42 },
          { ...bravo, maintainerrExclusionId: 84 },
        ],
        totalSize: 3,
        offset: 0,
        limit: 2,
      });
    });

    // A page comes back short when the adapter drops a row of a kind the query
    // did not ask for (#3550), so the next page re-reads the difference.
    it('does not duplicate the overlap after a short page', async () => {
      const showItem = (id: string, title: string): MediaItem => ({
        id,
        title,
        guid: `guid-${id}`,
        type: 'show',
        addedAt: new Date(),
        providerIds: {},
        mediaSources: [],
        library: { id: 'lib1', title: 'Shows' },
      });
      const alpha = showItem('1', 'Alpha');
      const zulu = showItem('2', 'Zulu');
      const bravo = showItem('3', 'Bravo');

      mockMediaServerService.getLibraryContents
        .mockResolvedValueOnce({
          items: [alpha, zulu],
          totalSize: 3,
          offset: 0,
          limit: 250,
        })
        .mockResolvedValueOnce({
          items: [zulu, bravo],
          totalSize: 3,
          offset: 2,
          limit: 250,
        });
      mediaItemEnrichmentService.enrichItems.mockResolvedValueOnce([
        alpha,
        zulu,
        bravo,
      ]);

      await controller.getLibraryContent('lib1', 1, 10, 'show', 'excluded');

      expect(mediaItemEnrichmentService.enrichItems).toHaveBeenCalledWith([
        alpha,
        zulu,
        bravo,
      ]);
    });

    it('keeps walking when a whole page was dropped rows', async () => {
      const bravo = {
        id: '3',
        title: 'Bravo',
        guid: 'guid-3',
        type: 'show',
        addedAt: new Date(),
        providerIds: {},
        mediaSources: [],
        library: { id: 'lib1', title: 'Shows' },
      } satisfies MediaItem;

      mockMediaServerService.getLibraryContents
        .mockResolvedValueOnce({
          items: [],
          totalSize: 600,
          offset: 0,
          limit: 250,
        })
        .mockResolvedValueOnce({
          items: [bravo],
          totalSize: 600,
          offset: 250,
          limit: 250,
        });
      mediaItemEnrichmentService.enrichItems.mockResolvedValueOnce([bravo]);

      await controller.getLibraryContent('lib1', 1, 10, 'show', 'excluded');

      expect(mockMediaServerService.getLibraryContents).toHaveBeenNthCalledWith(
        2,
        'lib1',
        expect.objectContaining({ offset: 250 }),
      );
      expect(mediaItemEnrichmentService.enrichItems).toHaveBeenCalledWith([
        bravo,
      ]);
    });
  });

  describe('getOverviewBootstrap', () => {
    it('should return libraries with the first library content in one response', async () => {
      const library = {
        id: 'shows-library',
        title: 'Shows',
        type: 'show',
      };
      const item = {
        id: 'show-1',
        title: 'Show 1',
        guid: 'guid-show-1',
        type: 'show',
        addedAt: new Date(),
        providerIds: { tmdb: ['1'] },
        mediaSources: [],
        library: { id: 'shows-library', title: 'Shows' },
      } satisfies MediaItem;

      mockMediaServerService.getLibraries.mockResolvedValue([library] as any);
      mockMediaServerService.getLibraryContents.mockResolvedValue({
        items: [item],
        totalSize: 1,
        offset: 0,
        limit: 30,
      });

      const result = await controller.getOverviewBootstrap(30);

      expect(mockMediaServerService.getLibraries).toHaveBeenCalledTimes(1);
      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'shows-library',
        {
          offset: 0,
          limit: 30,
          type: 'show',
          sort: undefined,
          sortOrder: undefined,
        },
      );
      expect(mediaItemEnrichmentService.enrichItems).toHaveBeenCalledWith([
        item,
      ]);
      expect(result).toEqual({
        libraries: [library],
        selectedLibraryId: 'shows-library',
        content: {
          items: [item],
          totalSize: 1,
          offset: 0,
          limit: 30,
        },
      });
    });

    it('should return an empty bootstrap payload when there are no libraries', async () => {
      mockMediaServerService.getLibraries.mockResolvedValue([]);

      const result = await controller.getOverviewBootstrap(30);

      expect(mockMediaServerService.getLibraryContents).not.toHaveBeenCalled();
      expect(result).toEqual({
        libraries: [],
        selectedLibraryId: undefined,
        content: {
          items: [],
          totalSize: 0,
          offset: 0,
          limit: 30,
        },
      });
    });
  });

  describe('getLibraries - Unreachable Detection', () => {
    it('throws ServiceUnavailableException when configured but unreachable', async () => {
      mockMediaServerService.getLibraries.mockResolvedValue([]);
      mockMediaServerService.isSetup.mockReturnValue(true);
      mockMediaServerService.getStatus.mockResolvedValue(undefined);

      await expect(controller.getLibraries()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('returns an empty list when the server is reachable but has zero libraries', async () => {
      mockMediaServerService.getLibraries.mockResolvedValue([]);
      mockMediaServerService.isSetup.mockReturnValue(true);
      mockMediaServerService.getStatus.mockResolvedValue({
        machineId: 'm1',
        version: '1',
      });

      await expect(controller.getLibraries()).resolves.toEqual([]);
    });
  });

  describe('updateCollectionVisibility - Validation Logic', () => {
    it('should throw BadRequestException when libraryId is missing', async () => {
      const settings = {
        collectionId: 'coll1',
        recommended: true,
      } as any;

      await expect(
        controller.updateCollectionVisibility(settings),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when collectionId is missing', async () => {
      const settings = {
        libraryId: '1',
        recommended: true,
      } as any;

      await expect(
        controller.updateCollectionVisibility(settings),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no visibility settings provided', async () => {
      const settings = {
        libraryId: '1',
        collectionId: 'coll1',
      } as any;

      await expect(
        controller.updateCollectionVisibility(settings),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid settings with sharedHome', async () => {
      const settings = {
        libraryId: '1',
        collectionId: 'coll1',
        sharedHome: false,
      };

      await controller.updateCollectionVisibility(settings);

      expect(
        mockMediaServerService.updateCollectionVisibility,
      ).toHaveBeenCalledWith(settings);
    });
  });

  describe('getMaintainerrStatusDetails', () => {
    it('should load details using metadata parent relations when available', async () => {
      mockMediaServerService.getMetadata.mockResolvedValue({
        id: 'episode-1',
        parentId: 'season-1',
        grandparentId: 'show-1',
      } as MediaItem);

      await controller.getMaintainerrStatusDetails('episode-1');

      expect(
        mediaItemEnrichmentService.getMaintainerrStatusDetails,
      ).toHaveBeenCalledWith({
        id: 'episode-1',
        parentId: 'season-1',
        grandparentId: 'show-1',
      });
    });

    it('should warn when metadata is unavailable and fall back to direct item lookup', async () => {
      mockMediaServerService.getMetadata.mockResolvedValue(undefined);

      await controller.getMaintainerrStatusDetails('missing-item');

      expect(logger.warn).toHaveBeenCalledWith(
        'Metadata was not found for media item missing-item; Maintainerr status details may omit parent-level exclusions.',
      );
      expect(
        mediaItemEnrichmentService.getMaintainerrStatusDetails,
      ).toHaveBeenCalledWith({
        id: 'missing-item',
      });
    });
  });

  describe('searchContent - Parent Metadata', () => {
    it('should attach parent metadata for episode results', async () => {
      const episode = {
        id: 'episode-1',
        title: 'Episode 1',
        guid: 'guid-1',
        type: 'episode',
        addedAt: new Date(),
        providerIds: { tmdb: [] },
        mediaSources: [],
        library: { id: 'library-1', title: 'Library' },
        grandparentId: 'show-1',
      } satisfies MediaItem;
      const show = {
        id: 'show-1',
        title: 'Show',
        guid: 'guid-show',
        type: 'show',
        addedAt: new Date(),
        providerIds: { tmdb: ['123'] },
        mediaSources: [],
        library: { id: 'library-1', title: 'Library' },
      } satisfies MediaItem;

      mockMediaServerService.searchContent.mockResolvedValue([episode]);
      mockMediaServerService.getMetadata.mockResolvedValue(show);

      const result = await controller.searchContent('test');

      expect(mockMediaServerService.searchContent).toHaveBeenCalledWith('test');
      expect(mediaItemEnrichmentService.enrichItems).toHaveBeenCalledWith([
        episode,
      ]);
      expect(mockMediaServerService.getMetadata).toHaveBeenCalledWith('show-1');
      expect(result).toEqual([{ ...episode, parentItem: show }]);
    });
  });
});
