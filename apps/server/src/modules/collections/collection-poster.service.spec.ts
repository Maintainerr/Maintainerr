import { MediaServerFeature } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { dataDir as configDataDir } from '../../app/config/dataDir';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { CollectionPosterService } from './collection-poster.service';

const STORAGE_DIR = path.join(configDataDir, 'collection-posters');

const buildJpegBuffer = (size = 32) =>
  sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 80, g: 80, b: 80 },
    },
  })
    .jpeg()
    .toBuffer();

describe('CollectionPosterService', () => {
  let service: CollectionPosterService;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      CollectionPosterService,
    ).compile();
    service = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);

    mediaServer = {
      supportsFeature: jest.fn().mockReturnValue(true),
      setCollectionImage: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<IMediaServerService>;

    mediaServerFactory.getService.mockResolvedValue(mediaServer);

    fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
  });

  describe('storePoster', () => {
    it('persists a normalised JPEG to disk', async () => {
      const input = await buildJpegBuffer();
      const result = await service.storePoster(42, input);
      const stored = await service.loadStoredPoster(42);

      expect(result.contentType).toBe('image/jpeg');
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(stored?.contentType).toBe('image/jpeg');
      expect(stored?.buffer.length).toBeGreaterThan(0);
    });

    it('rejects garbage non-image bytes', async () => {
      await expect(
        service.storePoster(99, Buffer.from('not an image')),
      ).rejects.toThrow(/not a valid image/i);
      await expect(service.loadStoredPoster(99)).resolves.toBeNull();
    });
  });

  describe('removeStoredPoster', () => {
    it('deletes the on-disk file', async () => {
      const input = await buildJpegBuffer();
      await service.storePoster(7, input);
      expect(service.getStoredPosterFile(7)).not.toBeNull();

      service.removeStoredPoster(7);
      expect(service.getStoredPosterFile(7)).toBeNull();
    });

    it('is a no-op when nothing is stored', () => {
      expect(() => service.removeStoredPoster(404)).not.toThrow();
    });
  });

  describe('pushToMediaServer', () => {
    it('skips when no mediaServerId is provided', async () => {
      const pushed = await service.pushToMediaServer(
        null,
        Buffer.from('x'),
        'image/jpeg',
      );
      expect(pushed).toEqual({ attempted: false, pushed: false });
      expect(mediaServer.setCollectionImage).not.toHaveBeenCalled();
    });

    it('skips when no media server is configured', async () => {
      mediaServerFactory.getService.mockRejectedValueOnce(new Error('missing'));

      const pushed = await service.pushToMediaServer(
        'col-123',
        Buffer.from('x'),
        'image/jpeg',
      );

      expect(pushed).toEqual({ attempted: false, pushed: false });
      expect(mediaServer.setCollectionImage).not.toHaveBeenCalled();
    });

    it('skips when the media server does not support COLLECTION_POSTER', async () => {
      mediaServer.supportsFeature.mockReturnValue(false);

      const pushed = await service.pushToMediaServer(
        'col-123',
        Buffer.from('x'),
        'image/jpeg',
      );

      expect(pushed).toEqual({ attempted: false, pushed: false });
      expect(mediaServer.supportsFeature).toHaveBeenCalledWith(
        MediaServerFeature.COLLECTION_POSTER,
      );
      expect(mediaServer.setCollectionImage).not.toHaveBeenCalled();
    });

    it('uploads via the media server when supported', async () => {
      const buffer = Buffer.from('jpegbytes');
      const pushed = await service.pushToMediaServer(
        'col-123',
        buffer,
        'image/jpeg',
      );

      expect(pushed).toEqual({ attempted: true, pushed: true });
      expect(mediaServer.setCollectionImage).toHaveBeenCalledWith(
        'col-123',
        buffer,
        'image/jpeg',
      );
    });

    it('returns false on upload failure rather than throwing', async () => {
      mediaServer.setCollectionImage.mockRejectedValueOnce(new Error('boom'));

      const pushed = await service.pushToMediaServer(
        'col-123',
        Buffer.from('x'),
        'image/jpeg',
      );

      expect(pushed).toEqual({ attempted: true, pushed: false });
    });
  });
});
