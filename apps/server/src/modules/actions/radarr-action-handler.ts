import { Injectable } from '@nestjs/common';
import { DownloadClientApiService } from '../api/download-client-api/download-client-api.service';
import { leftoverCleanupScope } from '@maintainerr/contracts';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { RadarrMovie } from '../api/servarr-api/interfaces/radarr.interface';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import {
  findMetadataLookupMatch,
  formatMetadataLookupCandidates,
} from '../metadata/metadata-lookup.util';
import { MetadataService } from '../metadata/metadata.service';
import { SettingsDataService } from '../settings/settings-data.service';
import {
  LeftoverCleanupInput,
  LeftoverFolderCleanupService,
} from './leftover-folder-cleanup.service';

@Injectable()
export class RadarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly metadataService: MetadataService,
    private readonly settings: SettingsDataService,
    private readonly downloadClient: DownloadClientApiService,
    private readonly folderCleanup: LeftoverFolderCleanupService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RadarrActionHandler.name);
  }

  public async handleAction(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<boolean> {
    const radarrApiClient = await this.servarrApi.getRadarrApiClient(
      collection.radarrSettingsId,
    );

    const lookupCandidates =
      await this.metadataService.resolveLookupCandidatesForService(
        media.mediaServerId,
        'radarr',
        {
          tmdb: media.tmdbId,
          tvdb: media.tvdbId,
        },
      );

    if (lookupCandidates.length > 0) {
      const matchedResult = await findMetadataLookupMatch(lookupCandidates, {
        tmdb: (id) => radarrApiClient.getMovieByTmdbId(id),
      });
      const radarrMedia = matchedResult?.result;

      if (radarrMedia === undefined) {
        // Transient Radarr lookup failure (vs. null = confirmed not tracked):
        // fail closed instead of falling through to a media-server delete on a
        // blip. The item stays in the collection and is retried next run. (#3125)
        this.logger.log(
          `Couldn't reach Radarr to resolve a movie for media server item ${media.mediaServerId}. No action was taken; will retry next run.`,
        );
        return false;
      }

      if (radarrMedia?.id) {
        const matchedProvider =
          matchedResult.candidate.providerKey.toUpperCase();
        const matchedId = matchedResult.candidate.id;

        // Capture the torrent download ids BEFORE deleting: Radarr purges a
        // movie's history when the movie is removed, so this is the last chance
        // to learn which torrent(s) produced its files.
        const isFileDeletingAction =
          collection.arrAction === ServarrAction.DELETE ||
          collection.arrAction === ServarrAction.UNMONITOR_DELETE_EXISTING ||
          collection.arrAction === ServarrAction.UNMONITOR_DELETE_ALL;
        const downloadIds =
          isFileDeletingAction && this.settings.downloadClientConfigured()
            ? await radarrApiClient.getDownloadIdsForMovie(radarrMedia.id)
            : [];

        // Leftover-folder cleanup inputs, captured before the delete (the file
        // list is gone afterwards). Only UNMONITOR_DELETE_ALL strands a folder:
        // it removes the files one by one, whereas deleteMovie removes the whole
        // movie folder in Radarr itself. Only fetched when the feature is on, to
        // keep the common path free of extra calls.
        const cleanupScope = collection.cleanupLeftoverFolders
          ? leftoverCleanupScope(collection.type, collection.arrAction)
          : undefined;
        const cleanupInputs = cleanupScope
          ? await this.collectCleanupInputs(radarrApiClient, radarrMedia)
          : undefined;

        switch (collection.arrAction) {
          case ServarrAction.DELETE:
          case ServarrAction.UNMONITOR_DELETE_EXISTING:
            if (
              !(await radarrApiClient.deleteMovie(
                radarrMedia.id,
                true,
                collection.listExclusions,
              ))
            ) {
              return false;
            }
            this.logger.log(
              `Removed movie with ${matchedProvider} ID ${matchedId} from filesystem & Radarr`,
            );
            await this.downloadClient.removeDownloads(downloadIds);
            return true;
          case ServarrAction.UNMONITOR:
            if (
              !(
                await radarrApiClient.updateMovie(radarrMedia.id, {
                  monitored: false,
                  addImportExclusion: collection.listExclusions,
                })
              ).ok
            ) {
              return false;
            }
            this.logger.log(
              `Unmonitored movie with ${matchedProvider} ID ${matchedId}${collection.listExclusions ? ' & added to import exclusion list' : ''} in Radarr`,
            );
            return true;
          case ServarrAction.UNMONITOR_DELETE_ALL: {
            const updateResult = await radarrApiClient.updateMovie(
              radarrMedia.id,
              {
                monitored: false,
                deleteFiles: true,
                addImportExclusion: collection.listExclusions,
              },
            );

            if (!updateResult.ok) {
              return false;
            }
            // Say what was actually removed: Radarr holding no file records for
            // the movie deletes nothing, and claiming otherwise leaves a later
            // "it kept my file" report with no way to tell the two apart.
            this.logger.log(
              `Unmonitored movie with ${matchedProvider} ID ${matchedId}${collection.listExclusions ? ', added to import exclusion list' : ''}${
                updateResult.deletedFileCount > 0
                  ? ` & removed ${updateResult.deletedFileCount} file(s) from filesystem in Radarr`
                  : ' in Radarr; it had no files to remove'
              }`,
            );
            await this.downloadClient.removeDownloads(downloadIds);
            if (cleanupScope && cleanupInputs) {
              await this.folderCleanup.cleanupAfterDelete({
                ...cleanupInputs,
                folderPath: radarrMedia.path,
                scope: cleanupScope,
                label: radarrMedia.title,
              });
            }
            return true;
          }
          case ServarrAction.CHANGE_QUALITY_PROFILE: {
            const targetProfileId = collection.radarrQualityProfileId;

            if (!targetProfileId) {
              this.logger.warn(
                `No target quality profile configured for collection ${collection.title}`,
              );
              return false;
            }

            if (!Number.isInteger(targetProfileId) || targetProfileId <= 0) {
              this.logger.warn(
                `Invalid quality profile ID (${targetProfileId}) for collection ${collection.title}`,
              );
              return false;
            }

            if (radarrMedia.qualityProfileId === targetProfileId) {
              return true;
            }

            if (
              !(
                await radarrApiClient.updateMovie(radarrMedia.id, {
                  qualityProfileId: targetProfileId,
                })
              ).ok
            ) {
              return false;
            }

            this.logger.log(
              `Changed quality profile for movie with ${matchedProvider} ID ${matchedId} to profile ID ${targetProfileId} in Radarr`,
            );

            await radarrApiClient.searchMovie(radarrMedia.id);
            return true;
          }
          default:
            return false;
        }
      } else {
        const attemptedIds = formatMetadataLookupCandidates(lookupCandidates);

        if (collection.arrAction === ServarrAction.CHANGE_QUALITY_PROFILE) {
          this.logger.log(
            `Couldn't find movie in Radarr using resolved external IDs [${attemptedIds}] for media server ID ${media.mediaServerId}. No quality profile change was applied.`,
          );
          return false;
        }

        if (collection.arrAction !== ServarrAction.UNMONITOR) {
          this.logger.log(
            `Couldn't find movie in Radarr using resolved external IDs [${attemptedIds}] for media server ID ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
          );
          if (
            collection.cleanupLeftoverFolders &&
            leftoverCleanupScope(collection.type, collection.arrAction)
          ) {
            this.folderCleanup.logNotApplicableForUntrackedItem(
              media.mediaServerId,
            );
          }
          const mediaServer = await this.mediaServerFactory.getService();
          await mediaServer.deleteFromDisk(media.mediaServerId);
          return true;
        } else {
          this.logger.log(
            `Radarr unmonitor action was not possible because no resolved external ID [${attemptedIds}] matched a movie in Radarr for media server ID ${media.mediaServerId}.`,
          );
          return false;
        }
      }
    } else {
      this.logger.log(
        `Couldn't resolve any supported external IDs for movie with media server ID ${media.mediaServerId}. Please check this movie manually.`,
      );
      return false;
    }

    return false;
  }

  /**
   * The fences the leftover-folder cleanup needs, read before the delete: the
   * root folders it may act inside, the file paths that prove the folder is the
   * one just emptied, and the other movie folders it must not touch.
   *
   * Every read here is uncached: these fence a filesystem delete, and a movie
   * that the cached snapshot predates would leave the fence blind to it.
   */
  private async collectCleanupInputs(
    radarrApiClient: Awaited<ReturnType<ServarrService['getRadarrApiClient']>>,
    radarrMedia: RadarrMovie,
  ): Promise<
    | Pick<
        LeftoverCleanupInput,
        'rootFolderPaths' | 'deletedFilePaths' | 'otherItemPaths'
      >
    | undefined
  > {
    try {
      const [rootFolders, movieFiles, movies] = await Promise.all([
        radarrApiClient.getRootFolders({ fresh: true }),
        radarrApiClient.getMovieFiles(radarrMedia.id),
        radarrApiClient.getMovies(),
      ]);

      // undefined = the listing failed, so which files are about to be deleted
      // is unknown - not "none". Skip rather than fence on a guess.
      if (movieFiles === undefined) {
        return undefined;
      }

      return {
        rootFolderPaths: (rootFolders ?? [])
          .map((folder) => folder.path)
          .filter((p): p is string => !!p),
        deletedFilePaths: movieFiles
          .map((file) => file.path)
          .filter((p): p is string => !!p),
        otherItemPaths: (movies ?? [])
          .filter((movie) => movie.id !== radarrMedia.id)
          .map((movie) => movie.path)
          .filter((p): p is string => !!p),
      };
    } catch (error) {
      this.logger.debug(error);
      return undefined;
    }
  }
}
