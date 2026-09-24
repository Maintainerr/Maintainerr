import { Injectable } from '@nestjs/common';
import { RadarrActionHandler } from '../actions/radarr-action-handler';
import { SonarrActionHandler } from '../actions/sonarr-action-handler';
import { SportarrActionHandler } from '../actions/sportarr-action-handler';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { OmbiApiService } from '../api/ombi-api/ombi-api.service';
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
 *   pruned from the collection(s) - a cleanup, not a failure or a real handle.
 */
export type HandleMediaResult = 'handled' | 'failed' | 'removed-missing';

/** What the request removal needs from Seerr and Ombi alike. */
interface RequestService {
  removeSeasonRequest(
    tmdbId: number,
    season: number,
  ): Promise<boolean | undefined>;
  removeMediaByTmdbId(
    tmdbId: number,
    type: 'movie' | 'tv',
  ): Promise<boolean | undefined>;
}

// The media server may run on Windows, so either separator can appear.
const folderOf = (filePath: string): string => {
  const cut = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return cut > 0 ? filePath.slice(0, cut) : filePath;
};

@Injectable()
export class CollectionHandler {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly collectionService: CollectionsService,
    private readonly seerrApi: SeerrApiService,
    private readonly ombiApi: OmbiApiService,
    private readonly settings: SettingsDataService,
    private readonly metadataService: MetadataService,
    private readonly radarrActionHandler: RadarrActionHandler,
    private readonly sonarrActionHandler: SonarrActionHandler,
    private readonly sportarrActionHandler: SportarrActionHandler,
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

    // An *arr deletes behind the media server's back, which keeps listing the
    // item until it rescans that folder; read the folder before it is gone.
    const usesArr = !!(
      collection.radarrSettingsId ||
      collection.sonarrSettingsId ||
      collection.sportarrSettingsId
    );
    const folder =
      freesDisk && usesArr
        ? await this.resolveFolder(mediaServer, media.mediaServerId)
        : undefined;

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
    } else if (library?.type == 'show' && collection.sportarrSettingsId) {
      actionHandled = await this.sportarrActionHandler.handleAction(
        collection,
        media,
      );
    } else if (!usesArr) {
      if (freesDisk) {
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
      // collection means re-processing it - and re-resolving its dead BoxSet
      // link - on every run (#3023). A failed existence check is treated as
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
      // retries - no permanent stale state, so no special-casing needed here.
      await this.collectionService.removeFromCollection(collection.id, [
        {
          mediaServerId: media.mediaServerId,
        },
      ]);
      await this.pruneSiblingCollections(collection.id, media.mediaServerId);
      this.recentlyHandledMedia.markHandled(collection.id, media.mediaServerId);
      return 'removed-missing';
    }

    // The request goes with the files, when forced. Seerr otherwise reconciles
    // through its availability sync; Ombi never un-marks an available request.
    if (freesDisk) {
      if (this.settings.seerrConfigured() && collection.forceSeerr) {
        await this.removeRequests('seerr', this.seerrApi, collection, media);
      }
      if (this.settings.ombiConfigured() && collection.forceOmbi) {
        await this.removeRequests('ombi', this.ombiApi, collection, media);
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

    // The collection's configured action retired this item, so record a
    // rule-removal marker - the same protection #3298 gives the rule executor's
    // own removals, extended to the handler path. For actions that leave the
    // file in place (UNMONITOR / quality change) the item stays on the media
    // server, so if the BoxSet removal above silently no-ops it lingers there;
    // without a marker the next run would re-adopt it as a spurious manual
    // member. The marker lets that run self-heal it instead. Automatic,
    // still-linked collections only (a manual collection has no rule to reclaim
    // it; an emptied collection was unlinked above so nothing can linger).
    // Best-effort: a marker write must never fail an already-applied action.
    if (!collection.manualCollection && collection.mediaServerId) {
      try {
        await this.collectionService.markRuleRemoved(collection.id, [
          media.mediaServerId,
        ]);
      } catch (error) {
        this.logger.debug(error);
      }
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

    if (folder) {
      try {
        await mediaServer.scanFolder(collection.libraryId.toString(), folder);
      } catch (error) {
        this.logger.warn(
          `Could not ask the media server to rescan '${folder}' after removing media ${media.mediaServerId}; it may keep listing the item until its next library scan`,
        );
        this.logger.debug(error);
      }
    }

    return 'handled';
  }

  /**
   * The folder holding an item's files, in the media server's own path
   * namespace; undefined when the server reports no path.
   */
  private async resolveFolder(
    mediaServer: IMediaServerService,
    itemId: string,
  ): Promise<string | undefined> {
    try {
      let item = await mediaServer.getMetadata(itemId);
      // A Plex season has no path of its own; its show does.
      if (item?.type === 'season' && !item.path && item.parentId) {
        item = await mediaServer.getMetadata(item.parentId);
      }
      if (!item?.path) return undefined;
      return item.type === 'movie' || item.type === 'episode'
        ? folderOf(item.path)
        : item.path;
    } catch (error) {
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * Removes the title's requests from a request service. Both services take a
   * TMDB id and answer `undefined` when the outcome is unknown, so only a
   * confirmed removal is reported as one.
   */
  private async removeRequests(
    service: 'seerr' | 'ombi',
    api: RequestService,
    collection: Collection,
    media: CollectionMedia,
  ): Promise<void> {
    const label = service === 'seerr' ? 'Seerr' : 'Ombi';
    const ids = await this.metadataService.resolveIdsForService(
      media.mediaServerId,
      service,
    );
    const tmdbId = (ids?.tmdb as number | undefined) ?? media.tmdbId;

    if (!tmdbId) {
      this.logger.warn(
        `[${label}] Could not resolve TMDB ID for media server ID ${media.mediaServerId}. Skipping ${label} request removal.`,
      );
      return;
    }

    let removed: boolean | undefined;
    let subject: string;
    switch (collection.type) {
      case 'season': {
        const mediaServer = await this.getMediaServer();
        const season = await mediaServer.getMetadata(media.mediaServerId);
        // != null: a null season index must not reach the service as a
        // season number either
        if (season?.index == null) {
          return;
        }
        removed = await api.removeSeasonRequest(tmdbId, season.index);
        subject = `request of season ${season.index} from show with TMDB ID '${tmdbId}'`;
        break;
      }
      case 'episode':
        // Neither service can remove one episode's request: Seerr tracks
        // requests per season and Ombi only deletes a whole child request, so
        // the still-present episodes would go with it. The UI hides the toggle
        // for episode rules; this also guards existing collections that still
        // have it set.
        this.logger.debug(
          `[${label}] Skipping request removal for episode-level collection '${collection.title}' (TMDB ID '${tmdbId}'): requests are not tracked per episode.`,
        );
        return;
      default:
        // Keyed on the collection's own type, not the library lookup:
        // `library` is undefined whenever the media server stops listing
        // the id, and `undefined?.type` silently reads as 'movie'. TMDB
        // numbers movies and shows independently, so that sends a show's id
        // to the movie endpoint, where it can resolve to an unrelated film
        // whose request is then deleted.
        removed = await api.removeMediaByTmdbId(
          tmdbId,
          collection.type === 'show' ? 'tv' : 'movie',
        );
        subject = `requests of media with TMDB ID '${tmdbId}'`;
    }

    if (removed === undefined) {
      this.logger.warn(`[${label}] Couldn't remove the ${subject}`);
    } else if (removed) {
      this.logger.log(`[${label}] Removed ${subject}`);
    }
  }

  /**
   * Prune an item from every OTHER managed collection that still lists it, so a
   * dead BoxSet link doesn't linger and get re-resolved on every rule run
   * (#3023). Each pruned sibling is marked handled: the rule executor checks
   * that guard per collection, so without it the sibling's next pass could
   * re-add the item - it may still resolve on the media server, and conditions
   * like `isWatched` stay true - firing a spurious `Media Added` notification
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
