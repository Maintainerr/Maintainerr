import { MediaServerFactory } from '../media-server/media-server.factory';
import { IMediaServerService } from '../media-server/media-server.interface';
import { PlexApiLegacyController } from './plex-api-legacy.controller';

describe('PlexApiLegacyController', () => {
  let controller: PlexApiLegacyController;
  let mockMediaServerFactory: jest.Mocked<MediaServerFactory>;
  let mockMediaServerService: jest.Mocked<IMediaServerService>;

  beforeEach(() => {
    mockMediaServerService = {
      getCollections: jest.fn().mockResolvedValue([]),
      getLibraryContents: jest.fn().mockResolvedValue({
        items: [],
        totalSize: 0,
        offset: 0,
        limit: 50,
      }),
      getStatus: jest.fn().mockResolvedValue({
        machineId: 'machine-1',
        version: '1.0.0',
      }),
    } as unknown as jest.Mocked<IMediaServerService>;

    mockMediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mockMediaServerService),
    } as unknown as jest.Mocked<MediaServerFactory>;

    controller = new PlexApiLegacyController(mockMediaServerFactory);
  });

  describe('compat translation', () => {
    it('maps media-server collections to legacy Plex collection fields', async () => {
      mockMediaServerService.getCollections.mockResolvedValue([
        {
          id: '123',
          title: 'Leaving Soon',
          summary: 'Soon gone',
          childCount: 4,
        },
      ] as any);

      const result = await controller.getCollections('1');

      expect(mockMediaServerFactory.getService).toHaveBeenCalled();
      expect(result).toEqual([
        expect.objectContaining({
          ratingKey: '123',
          title: 'Leaving Soon',
          childCount: '4',
          type: 'collection',
        }),
      ]);
    });

    it('maps media-server library items to legacy Plex library item fields', async () => {
      mockMediaServerService.getLibraryContents.mockResolvedValue({
        items: [
          {
            id: '10',
            title: 'Movie',
            guid: 'plex://movie/10',
            type: 'movie',
            addedAt: new Date('2026-03-01T00:00:00Z'),
            providerIds: { imdb: ['tt10'] },
            mediaSources: [{ id: '1', duration: 1000 }],
            library: { id: '5', title: 'Movies' },
          },
        ],
        totalSize: 1,
        offset: 50,
        limit: 25,
      } as any);

      const result = await controller.getLibraryContent('10', 3, 25);

      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        '10',
        { offset: 50, limit: 25 },
      );
      expect(result).toEqual({
        totalSize: 1,
        items: [
          expect.objectContaining({
            ratingKey: '10',
            librarySectionID: 5,
            librarySectionTitle: 'Movies',
          }),
        ],
      });
    });

    it('maps media-server status to legacy Plex status fields', async () => {
      const result = await controller.getStatus();

      expect(result).toEqual({
        machineIdentifier: 'machine-1',
        version: '1.0.0',
      });
    });
  });
});
