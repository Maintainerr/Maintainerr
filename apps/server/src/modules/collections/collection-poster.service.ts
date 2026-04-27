import { MediaServerFeature } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { dataDir as configDataDir } from '../../app/config/dataDir';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { MaintainerrLogger } from '../logging/logs.service';

const STORED_CONTENT_TYPE = 'image/jpeg';
const STORED_EXTENSION = '.jpg';

export class InvalidCollectionPosterError extends Error {}

/**
 * Manages user-uploaded poster artwork for Maintainerr-managed collections.
 *
 * Storage model:
 *  - One JPEG per Maintainerr collection at
 *    `data/collection-posters/{collectionDbId}.jpg`. File presence is the
 *    flag — there is no DB column. Same on-disk pattern as the overlay
 *    originals backup ([overlay-processor.service.ts](../overlays/overlay-processor.service.ts)).
 *  - Db id is stable across media-server collection re-creates, so a stored
 *    poster survives Plex/Jellyfin collection deletion + recreation.
 *
 * Coexistence:
 *  - Maintainerr is one writer among several (Kometa, Posterizarr, manual
 *    uploads). This is a single write — last writer wins. Unlike per-item
 *    overlays (which re-apply on cron because they carry day-counter state),
 *    collection posters carry no per-cycle state, so callers should write
 *    only when the source bytes change (user upload, collection re-create);
 *    polling on a schedule would just fight other writers for no benefit.
 */
@Injectable()
export class CollectionPosterService {
  private readonly storageDir: string;

  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(CollectionPosterService.name);
    this.storageDir = path.join(configDataDir, 'collection-posters');
  }

  private getStoragePath(collectionDbId: number): string {
    return path.join(this.storageDir, `${collectionDbId}${STORED_EXTENSION}`);
  }

  /**
   * Returns the on-disk poster bytes, or null if none stored.
   */
  getStoredPosterFile(
    collectionDbId: number,
  ): { contentType: string; path: string } | null {
    const filePath = this.getStoragePath(collectionDbId);
    if (!fs.existsSync(filePath)) return null;
    return {
      contentType: STORED_CONTENT_TYPE,
      path: filePath,
    };
  }

  async loadStoredPoster(
    collectionDbId: number,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const storedFile = this.getStoredPosterFile(collectionDbId);
    if (!storedFile) return null;

    return {
      buffer: await fs.promises.readFile(storedFile.path),
      contentType: storedFile.contentType,
    };
  }

  /**
   * Validate, normalise (re-encode to JPEG so the on-disk format stays
   * predictable), and persist the uploaded image. Throws if the bytes are
   * not a valid image.
   */
  async storePoster(
    collectionDbId: number,
    buffer: Buffer,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    let normalised: Buffer;
    try {
      normalised = await sharp(buffer)
        .rotate()
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch (error) {
      this.logger.warn(
        `Rejected collection ${collectionDbId} poster upload — not a valid image`,
      );
      this.logger.debug(error);
      throw new InvalidCollectionPosterError(
        'Uploaded file is not a valid image',
      );
    }

    await fs.promises.mkdir(this.storageDir, { recursive: true });
    await fs.promises.writeFile(
      this.getStoragePath(collectionDbId),
      normalised,
    );

    return { buffer: normalised, contentType: STORED_CONTENT_TYPE };
  }

  /**
   * Remove the stored poster file. Does not touch the media-server side —
   * the user must clear/refresh the poster in Plex/Jellyfin themselves if
   * they want the original artwork back.
   */
  removeStoredPoster(collectionDbId: number): void {
    const filePath = this.getStoragePath(collectionDbId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Push a poster to the configured media server's collection. Best-effort:
   * silently no-ops if the server doesn't support COLLECTION_POSTER, has no
   * mediaServerId yet, or upload fails (caller logs context).
   */
  async pushToMediaServer(
    mediaServerId: string | null | undefined,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ attempted: boolean; pushed: boolean }> {
    if (!mediaServerId) {
      return { attempted: false, pushed: false };
    }

    let mediaServer;
    try {
      mediaServer = await this.mediaServerFactory.getService();
    } catch (error) {
      this.logger.warn(
        'Cannot push collection poster — no media server configured',
      );
      this.logger.debug(error);
      return { attempted: false, pushed: false };
    }

    if (!mediaServer.supportsFeature(MediaServerFeature.COLLECTION_POSTER)) {
      return { attempted: false, pushed: false };
    }

    try {
      await mediaServer.setCollectionImage(mediaServerId, buffer, contentType);
      return { attempted: true, pushed: true };
    } catch (error) {
      this.logger.warn(
        `Failed to push collection poster to media server (collection ${mediaServerId})`,
      );
      this.logger.debug(error);
      return { attempted: true, pushed: false };
    }
  }
}
