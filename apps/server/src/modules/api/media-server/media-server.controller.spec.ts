import { BadRequestException } from '@nestjs/common';
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

  beforeEach(() => {
    mockMediaServerService = {
      getLibraryContents: jest.fn().mockResolvedValue({
        items: [],
        totalSize: 0,
        offset: 0,
        limit: 50,
      }),
      updateCollectionVisibility: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IMediaServerService>;

    mockMediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mockMediaServerService),
    } as unknown as jest.Mocked<MediaServerFactory>;

    controller = new MediaServerController(mockMediaServerFactory);
  });

  describe('getLibraryContent - Pagination Logic', () => {
    it('should use default pagination (page 1, limit 50, offset 0)', async () => {
      await controller.getLibraryContent('lib1');

      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'lib1',
        { offset: 0, limit: 50, type: undefined },
      );
    });

    it('should calculate offset correctly for page 2 with limit 50', async () => {
      await controller.getLibraryContent('lib1', 2, 50);

      // offset = (page - 1) * limit = (2 - 1) * 50 = 50
      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'lib1',
        { offset: 50, limit: 50, type: undefined },
      );
    });

    it('should calculate offset correctly for page 3 with limit 25', async () => {
      await controller.getLibraryContent('lib1', 3, 25);

      // offset = (page - 1) * limit = (3 - 1) * 25 = 50
      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'lib1',
        { offset: 50, limit: 25, type: undefined },
      );
    });

    it('should calculate offset correctly for page 5 with limit 10', async () => {
      await controller.getLibraryContent('lib1', 5, 10);

      // offset = (page - 1) * limit = (5 - 1) * 10 = 40
      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'lib1',
        { offset: 40, limit: 10, type: undefined },
      );
    });

    it('should pass type filter to service', async () => {
      await controller.getLibraryContent('lib1', 1, 50, 'movie');

      expect(mockMediaServerService.getLibraryContents).toHaveBeenCalledWith(
        'lib1',
        { offset: 0, limit: 50, type: 'movie' },
      );
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

    it('should accept valid settings with recommended', async () => {
      const settings = {
        libraryId: '1',
        collectionId: 'coll1',
        recommended: true,
      };

      await controller.updateCollectionVisibility(settings);

      expect(
        mockMediaServerService.updateCollectionVisibility,
      ).toHaveBeenCalledWith(settings);
    });

    it('should accept valid settings with ownHome', async () => {
      const settings = {
        libraryId: '1',
        collectionId: 'coll1',
        ownHome: true,
      };

      await controller.updateCollectionVisibility(settings);

      expect(
        mockMediaServerService.updateCollectionVisibility,
      ).toHaveBeenCalledWith(settings);
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
});
