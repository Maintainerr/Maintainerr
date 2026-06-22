import { Injectable } from '@nestjs/common';
import { RadarrActionHandler } from '../actions/radarr-action-handler';
import { SonarrActionHandler } from '../actions/sonarr-action-handler';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import { SettingsDataService } from '../settings/settings-data.service';
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';
import { ServarrAction } from './interfaces/collection.interface';
import { RecentlyHandledMediaService } from './recently-handled-media.service';

/**
 * Outcome of handling a single collection media item.
 * - `handled`: the configured action ran and the item was processed.
 * - `failed`: the action could not be completed; the item stays for retry.
 * - `removed-missing`: the item no longer existed on the media server and was
 *   pruned from the collection(s) — a cleanup, not a failure or a real handle.
 */
export type HandleMediaResult = 'handled' | 'failed' | 'removed-missing';

@Injectable()
export class CollectionHandler {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly collectionService: CollectionsService,
    private readonly seerrApi: SeerrApiService,
    private readonly settings: SettingsDataService,
    private readonly metadataService: MetadataService,
    private readonly radarrActionHandler: RadarrActionHandler,
    private readonly sonarrActionHandler: SonarrActionHandler,
    private readonly logger: MaintainerrLogger,
    private readonly recentlyHandledMedia: RecentlyHandledMediaService,
  ) {
    logger.setContext(CollectionHandler.name);
  }

  /**
   * Get the appropriate media server service based on current settings
   */
  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  public async handleMedia(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<HandleMediaResult> {
    if (collection.arrAction === ServarrAction.DO_NOTHING) {
      return 'failed';
    }

    const mediaServer = await this.getMediaServer();
    const libraries = await mediaServer.getLibraries();
    const library = libraries.find(
      (e) => e.id === collection.libraryId.toString(),
    );

    // Resolve the on-disk size before running the action. The size cache is
    // populated lazily by the collection size sync; if the handler runs
    // against a freshly-added item before the next sync, `media.sizeBytes`
    // is null and the post-action increment below would silently drop the
    // bytes. After a delete-style action the file is gone and the media
    // server's metadata loses the size, so this lookup has to happen first.
    const freesDisk =
      collection.arrAction !== ServarrAction.UNMONITOR &&
      collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY &&
      collection.arrAction !== ServarrAction.CHANGE_QUALITY_PROFILE;
    let resolvedSizeBytes: number | null =
      media.sizeBytes != null && Number(media.sizeBytes) > 0
        ? Number(media.sizeBytes)
        : null;
    if (freesDisk && resolvedSizeBytes === null) {
      resolvedSizeBytes = await this.collectionService.resolveItemSize(
        mediaServer,
        media.mediaServerId,
      );
    }

    let actionHandled = false;

    if (library?.type === 'movie' && collection.radarrSettingsId) {
      actionHandled = await this.radarrActionHandler.handleAction(
        collection,
        media,
      );
    } else if (library?.type == 'show' && collection.sonarrSettingsId) {
      actionHandled = await this.sonarrActionHandler.handleAction(
        collection,
        media,
      );
    } else if (!collection.radarrSettingsId && !collection.sonarrSettingsId) {
      if (
        collection.arrAction !== ServarrAction.UNMONITOR &&
        collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY &&
        collection.arrAction !== ServarrAction.CHANGE_QUALITY_PROFILE
      ) {
        this.logger.log(
          `Couldn't utilize *arr to find and remove the media with id ${media.mediaServerId}. Attempting to remove from the filesystem via media server. No unmonitor action was taken.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
        actionHandled = true;
      } else {
        this.logger.log(
          `*arr action isn't possible without *arr configured. No action was taken for media with id ${media.mediaServerId}.`,
        );
      }
    }

    if (!actionHandled) {
      // The action didn't run. Before treating this as a retryable failure,
      // check whether the item still exists: if it's already gone from the
      // media server there is nothing left to act on, and leaving it in the
      // collection means re-processing it — and re-resolving its dead BoxSet
      // link — on every run (#3023). A failed existence check is treated as
      // "still present" so a transient blip never drops a live item.
      let exists = true;
      try {
        exists = await mediaServer.itemExists(media.mediaServerId);
      } catch (error) {
        this.logger.debug(error);
      }

      if (exists) {
        return 'failed';
      }

      this.logger.log(
        `Media with id ${media.mediaServerId} no longer exists on the media server; removing it from collection '${collection.title}' and any others that still list it.`,
      );
      // The removal-by-id is a no-op on the media server for a gone item (Plex
      // skips 404, Jellyfin/Emby return 2xx), so these drop the stale DB rows.
      // A genuinely transient removal failure keeps the row, which the next run
      // retries — no permanent stale state, so no special-casing needed here.
      await this.collectionService.removeFromCollection(collection.id, [
        {
          mediaServerId: media.mediaServerId,
        },
      ]);
      await this.pruneSiblingCollections(collection.id, media.mediaServerId);
      this.recentlyHandledMedia.markHandled(collection.id, media.mediaServerId);
      return 'removed-missing';
    }

    // Only remove requests & file if needed
    if (
      collection.arrAction !== ServarrAction.UNMONITOR &&
      collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY &&
      collection.arrAction !== ServarrAction.DELETE_SHOW_IF_EMPTY &&
      collection.arrAction !== ServarrAction.CHANGE_QUALITY_PROFILE
    ) {
      // Seerr, if forced. Otherwise rely on media sync
      if (this.settings.seerrConfigured() && collection.forceSeerr) {
        const ids = await this.metadataService.resolveIdsForService(
          media.mediaServerId,
          'seerr',
        );
        const tmdbId = (ids?.tmdb as number | undefined) ?? media.tmdbId;

        if (!tmdbId) {
          this.logger.warn(
            `[Seerr] Could not resolve TMDB ID for media server ID ${media.mediaServerId}. Skipping Seerr request removal.`,
          );
        } else {
          switch (collection.type) {
            case 'season': {
              const mediaDataSeason = await mediaServer.getMetadata(
                media.mediaServerId,
              );

              if (mediaDataSeason?.index !== undefined) {
                await this.seerrApi.removeSeasonRequest(
                  tmdbId,
                  mediaDataSeason.index,
                );

                this.logger.log(
                  `[Seerr] Removed request of season ${mediaDataSeason.index} from show with TMDB ID '${tmdbId}'`,
                );
              }
              break;
            }
            case 'episode': {
              // Seerr tracks requests per season, not per episode, so there is
              // no per-episode request to remove — deleting the season request
              // would drop the request for every other (still-present) episode
              // in that season. Skip the force-removal and let Seerr's
              // availability sync reconcile, as it does when Force Seerr is off.
              // The UI hides the toggle for episode rules; this also guards
              // existing collections that still have it set.
              this.logger.debug(
                `[Seerr] Skipping request removal for episode-level collection '${collection.title}' (TMDB ID '${tmdbId}'): Seerr has no per-episode request granularity. Relying on availability sync.`,
              );
              break;
            }
            default:
              await this.seerrApi.removeMediaByTmdbId(
                tmdbId,
                library?.type === 'show' ? 'tv' : 'movie',
              );
              this.logger.log(
                `[Seerr] Removed requests of media with TMDB ID '${tmdbId}'`,
              );
              break;
          }
        }
      }
    }

    // Removing the last item empties the collection, which deletes the
    // media-server collection and clears `mediaServerId` in the DB. Continue
    // from the persisted result, not the stale snapshot passed in: the
    // `saveCollection` below would otherwise rewrite the whole row and
    // resurrect the now-dead `mediaServerId`, leaving a link the next rule run
    // can only discover via a 404.
    const updatedCollection = await this.collectionService.removeFromCollection(
      collection.id,
      [
        {
          mediaServerId: media.mediaServerId,
        },
      ],
    );
    if (updatedCollection) {
      collection = updatedCollection;
    }

    // The file is gone after a disk-freeing action (DELETE, DELETE_SHOW_IF_EMPTY,
    // and the UNMONITOR_DELETE_* variants all delete files), but the item still
    // resolves on the media server until its next library scan. Prune it from
    // any other managed collection that still lists it now, while a valid id
    // exists to remove. Unmonitor / quality actions leave the file in place, so
    // the item legitimately stays.
    if (freesDisk) {
      await this.pruneSiblingCollections(collection.id, media.mediaServerId);
    }

    collection.handledMediaAmount++;

    // Credit bytes for delete-style actions only; unmonitor / quality-change
    // leave files on disk. `resolvedSizeBytes` was captured before the action
    // ran so it survives the file being gone afterwards.
    if (freesDisk && resolvedSizeBytes != null && resolvedSizeBytes > 0) {
      collection.handledMediaSizeBytes =
        Number(collection.handledMediaSizeBytes ?? 0) + resolvedSizeBytes;
    }

    await this.collectionService.CollectionLogRecordForChild(
      media.mediaServerId,
      collection.id,
      'handle',
    );

    // Remember this so the rule executor's next pass doesn't re-add the
    // same item (and fire a `Media Added` notification) before any rule
    // input has had a chance to change. Lives here so both the scheduled
    // worker and the manual `POST /media/handle` endpoint feed the set.
    this.recentlyHandledMedia.markHandled(collection.id, media.mediaServerId);

    await this.collectionService.saveCollection(collection);

    return 'handled';
  }

  /**
   * Prune an item from every OTHER managed collection that still lists it, so a
   * dead BoxSet link doesn't linger and get re-resolved on every rule run
   * (#3023). Each pruned sibling is marked handled: the rule executor checks
   * that guard per collection, so without it the sibling's next pass could
   * re-add the item — it may still resolve on the media server, and conditions
   * like `isWatched` stay true — firing a spurious `Media Added` notification
   * and recreating the link this cleanup just removed.
   */
  private async pruneSiblingCollections(
    collectionId: number,
    mediaServerId: string,
  ): Promise<void> {
    const prunedCollectionIds =
      await this.collectionService.removeMediaFromOtherCollections(
        mediaServerId,
        collectionId,
      );

    for (const prunedCollectionId of prunedCollectionIds) {
      this.recentlyHandledMedia.markHandled(prunedCollectionId, mediaServerId);
    }
  }
}
