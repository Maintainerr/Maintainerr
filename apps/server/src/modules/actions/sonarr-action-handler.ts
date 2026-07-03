import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { dirname } from 'path';
import { DownloadClientApiService } from '../api/download-client-api/download-client-api.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import {
  SonarrEpisode,
  SonarrSeries,
} from '../api/servarr-api/interfaces/sonarr.interface';
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
import { LeftoverFolderCleanupService } from './leftover-folder-cleanup.service';

@Injectable()
export class SonarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly seerrApi: SeerrApiService,
    private readonly metadataService: MetadataService,
    private readonly settings: SettingsDataService,
    private readonly downloadClient: DownloadClientApiService,
    private readonly folderCleanup: LeftoverFolderCleanupService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SonarrActionHandler.name);
  }

  public async handleAction(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<boolean> {
    const mediaServer = await this.mediaServerFactory.getService();
    const sonarrApiClient = await this.servarrApi.getSonarrApiClient(
      collection.sonarrSettingsId,
    );

    let mediaData: MediaItem | undefined = undefined;

    if (['season', 'episode'].includes(collection.type)) {
      mediaData = await mediaServer.getMetadata(media.mediaServerId);
    }

    const lookupCandidates =
      await this.metadataService.resolveLookupCandidatesForService(
        media.mediaServerId,
        'sonarr',
        {
          tvdb: media.tvdbId,
          tmdb: media.tmdbId,
        },
      );

    if (lookupCandidates.length === 0) {
      this.logger.log(
        `Couldn't resolve any supported external IDs for media server item ${media.mediaServerId}. No action was taken. Please check this show manually.`,
      );
      return false;
    }

    const matchedResult = await findMetadataLookupMatch(lookupCandidates, {
      tvdb: (id) => sonarrApiClient.getSeriesByTvdbId(id),
    });
    let sonarrMedia = matchedResult?.result;

    if (sonarrMedia === undefined) {
      // Transient Sonarr lookup failure (vs. null = confirmed not tracked):
      // fail closed instead of falling through to a media-server delete on a
      // blip. The item stays in the collection and is retried next run. (#3125)
      this.logger.log(
        `Couldn't reach Sonarr to resolve a series for media server item ${media.mediaServerId}. No action was taken; will retry next run.`,
      );
      return false;
    }

    if (!sonarrMedia?.id) {
      const attemptedIds = formatMetadataLookupCandidates(lookupCandidates);

      if (collection.arrAction === ServarrAction.CHANGE_QUALITY_PROFILE) {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. No quality profile change was applied.`,
        );
        return false;
      }

      if (
        collection.arrAction !== ServarrAction.UNMONITOR &&
        collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY
      ) {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
        return true;
      } else {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. No unmonitor action was taken.`,
        );
        return false;
      }
    }

    // Capture the download ids before any delete (the history is consumed
    // afterwards). A whole-show delete removes every torrent the series
    // produced; a season/episode delete removes only the torrents fully covered
    // by it, since a season/series pack also backs episodes that are kept.
    const isFileDeletingAction =
      collection.arrAction === ServarrAction.DELETE ||
      collection.arrAction === ServarrAction.UNMONITOR_DELETE_ALL ||
      collection.arrAction === ServarrAction.UNMONITOR_DELETE_EXISTING ||
      collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY;
    let downloadIds: string[] = [];
    if (isFileDeletingAction && this.settings.downloadClientConfigured()) {
      if (collection.type === 'show') {
        downloadIds = await sonarrApiClient.getDownloadIdsForSeries(
          sonarrMedia.id,
        );
      } else if (
        collection.type === 'season' ||
        collection.type === 'episode'
      ) {
        downloadIds = await this.resolveCoveredDownloadIds(
          sonarrApiClient,
          sonarrMedia,
          collection.type,
          mediaData,
        );
      }
    }

    // Leftover-folder cleanup inputs, captured before the delete (paths and
    // episode-file ids are gone afterwards). Only gathered when the feature is
    // enabled and the action removes files, so the common path stays free of
    // extra Sonarr calls. The series folder is stable; the season folder is
    // derived from one in-season episode file (episode scope shares its folder,
    // so it is never cleaned).
    const cleanupEnabled =
      isFileDeletingAction && this.folderCleanup.isEnabled();
    const seriesFolderPath = sonarrMedia.path;
    const cleanupRootFolderPaths = cleanupEnabled
      ? ((await sonarrApiClient.getRootFolders()) ?? [])
          .map((folder) => folder.path)
          .filter((p): p is string => !!p)
      : [];
    const leftoverSeasonFolder =
      cleanupEnabled && collection.type === 'season'
        ? await this.resolveSeasonFolder(
            sonarrApiClient,
            sonarrMedia,
            mediaData?.index,
          )
        : undefined;

    switch (collection.arrAction) {
      case ServarrAction.DELETE_SHOW_IF_EMPTY:
        if (collection.type !== 'season') {
          this.logger.warn(
            `[Sonarr] DELETE_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
          );
          break;
        }
        sonarrMedia = await sonarrApiClient.unmonitorSeasons(
          sonarrMedia.id,
          mediaData?.index,
          true,
        );

        if (!sonarrMedia) {
          return false;
        }

        this.logger.log(
          `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
        );
        await this.deleteShowIfEmpty(
          sonarrApiClient,
          matchedResult.candidate,
          media.tmdbId,
          mediaData?.index,
          collection.listExclusions,
        );
        await this.downloadClient.removeDownloads(downloadIds);
        await this.cleanupSeasonFolder(
          leftoverSeasonFolder,
          seriesFolderPath,
          cleanupRootFolderPaths,
          sonarrMedia.title,
        );
        return true;
      case ServarrAction.DELETE:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            await this.downloadClient.removeDownloads(downloadIds);
            await this.cleanupSeasonFolder(
              leftoverSeasonFolder,
              seriesFolderPath,
              cleanupRootFolderPaths,
              sonarrMedia.title,
            );
            return true;
          case 'episode': {
            const episodeLookup = this.getEpisodeLookup(mediaData);

            if (!episodeLookup) {
              this.logger.warn(
                `[Sonarr] Couldn't identify episode '${mediaData?.title ?? media.mediaServerId}' for show '${sonarrMedia.title}'. No delete action was taken.`,
              );
              return false;
            }

            if (
              !(await sonarrApiClient.UnmonitorDeleteEpisodes(
                sonarrMedia.id,
                episodeLookup.seasonNumber,
                episodeLookup.episodeNumbers,
                true,
                episodeLookup.airDate,
              ))
            ) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.parentIndex} ${this.getEpisodeLogLabel(mediaData)} from show '${sonarrMedia.title}'`,
            );
            await this.downloadClient.removeDownloads(downloadIds);
            return true;
          }
          default:
            if (
              !(await sonarrApiClient.deleteShow(
                sonarrMedia.id,
                true,
                collection.listExclusions,
              ))
            ) {
              return false;
            }
            this.logger.log(`Removed show '${sonarrMedia.title}' from Sonarr`);
            await this.downloadClient.removeDownloads(downloadIds);
            await this.cleanupSeriesFolder(
              seriesFolderPath,
              cleanupRootFolderPaths,
              sonarrMedia.title,
            );
            return true;
        }
        break;
      case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
        if (collection.type !== 'season') {
          this.logger.warn(
            `[Sonarr] UNMONITOR_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
          );
          break;
        }
        sonarrMedia = await sonarrApiClient.unmonitorSeasons(
          sonarrMedia.id,
          mediaData?.index,
          false,
        );

        if (!sonarrMedia) {
          return false;
        }

        this.logger.log(
          `[Sonarr] Unmonitored season ${mediaData?.index} from show '${sonarrMedia.title}'`,
        );
        await this.unmonitorShowIfEmptyAndEnded(
          sonarrApiClient,
          matchedResult.candidate,
        );
        return true;
      case ServarrAction.UNMONITOR:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              false,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          case 'episode': {
            const episodeLookup = this.getEpisodeLookup(mediaData);

            if (!episodeLookup) {
              this.logger.warn(
                `[Sonarr] Couldn't identify episode '${mediaData?.title ?? media.mediaServerId}' for show '${sonarrMedia.title}'. No unmonitor action was taken.`,
              );
              return false;
            }

            if (
              !(await sonarrApiClient.UnmonitorDeleteEpisodes(
                sonarrMedia.id,
                episodeLookup.seasonNumber,
                episodeLookup.episodeNumbers,
                false,
                episodeLookup.airDate,
              ))
            ) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.parentIndex} ${this.getEpisodeLogLabel(mediaData)} from show '${sonarrMedia.title}'`,
            );
            return true;
          }
          default:
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              false,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}'`,
              );
              return true;
            }

            return false;
        }
      case ServarrAction.UNMONITOR_DELETE_ALL:
        switch (collection.type) {
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              true,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed all episodes`,
              );
              await this.downloadClient.removeDownloads(downloadIds);
              await this.cleanupSeriesFolder(
                seriesFolderPath,
                cleanupRootFolderPaths,
                sonarrMedia.title,
              );
              return true;
            }

            return false;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_ALL is not supported for type: ${collection.type}`,
            );
            return false;
        }
      case ServarrAction.UNMONITOR_DELETE_EXISTING:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
              true,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed existing episodes from season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            await this.downloadClient.removeDownloads(downloadIds);
            await this.cleanupSeasonFolder(
              leftoverSeasonFolder,
              seriesFolderPath,
              cleanupRootFolderPaths,
              sonarrMedia.title,
            );
            return true;
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'existing',
              true,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed existing episodes`,
              );
              await this.downloadClient.removeDownloads(downloadIds);
              await this.cleanupSeriesFolder(
                seriesFolderPath,
                cleanupRootFolderPaths,
                sonarrMedia.title,
              );
              return true;
            }

            return false;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_EXISTING is not supported for type: ${collection.type}`,
            );
            return false;
        }
        break;
      case ServarrAction.CHANGE_QUALITY_PROFILE: {
        if (collection.type === 'season' || collection.type === 'episode') {
          this.logger.warn(
            `[Sonarr] CHANGE_QUALITY_PROFILE is not supported for type: ${collection.type}. Quality profiles can only be changed for entire shows.`,
          );
          return false;
        }

        const targetProfileId = collection.sonarrQualityProfileId;

        if (!targetProfileId) {
          this.logger.warn(
            `No target quality profile configured for collection ${collection.title}`,
          );
          return false;
        }

        if (!Number.isInteger(targetProfileId) || targetProfileId <= 0) {
          this.logger.warn(
            `[Sonarr] Invalid quality profile ID (${targetProfileId}) for collection ${collection.title}`,
          );
          return false;
        }

        if (sonarrMedia.qualityProfileId === targetProfileId) {
          return true;
        }

        sonarrMedia.qualityProfileId = targetProfileId;
        if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
          return false;
        }

        this.logger.log(
          `[Sonarr] Changed quality profile for show '${sonarrMedia.title}' to profile ID ${targetProfileId}`,
        );

        await sonarrApiClient.searchSeries(sonarrMedia.id);
        return true;
      }
    }

    return false;
  }

  /**
   * The torrents a season/episode delete fully covers: those whose every backed
   * episode is in the deleted set. A season/series pack also backs episodes that
   * are kept, so it is excluded. Keyed on Sonarr's episodeId — this is the only
   * safeguard for a lone pack, since removeDownloads' cross-seed guard protects
   * torrents that share a content path, not one torrent backing several wanted
   * episodes. Fails closed: returns [] whenever coverage cannot be proven.
   */
  private async resolveCoveredDownloadIds(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    sonarrMedia: SonarrSeries,
    type: 'season' | 'episode',
    mediaData?: MediaItem,
  ): Promise<string[]> {
    try {
      // The deleted set comes from Sonarr's episode list (what the delete acts
      // on), not history, so it matches the files actually removed.
      let deletedEpisodes: SonarrEpisode[];
      if (type === 'season') {
        const seasonNumber = mediaData?.index;
        if (seasonNumber === undefined || seasonNumber === null) {
          this.logger.debug(
            `[Sonarr] Skipping download cleanup for '${sonarrMedia.title}': season number could not be determined.`,
          );
          return [];
        }
        deletedEpisodes = await sonarrApiClient.getEpisodes(
          sonarrMedia.id,
          seasonNumber,
        );
      } else {
        const lookup = this.getEpisodeLookup(mediaData);
        if (!lookup || lookup.episodeNumbers.length === 0) {
          this.logger.debug(
            `[Sonarr] Skipping download cleanup for '${sonarrMedia.title}': episode(s) could not be identified (e.g. air-date only).`,
          );
          return [];
        }
        deletedEpisodes = await sonarrApiClient.getEpisodes(
          sonarrMedia.id,
          lookup.seasonNumber,
          lookup.episodeNumbers,
        );
      }

      const deletedEpisodeIds = new Set(deletedEpisodes.map((e) => e.id));
      if (deletedEpisodeIds.size === 0) {
        this.logger.debug(
          `[Sonarr] Skipping download cleanup for '${sonarrMedia.title}': no matching episodes resolved.`,
        );
        return [];
      }

      const history = await sonarrApiClient.getSeriesDownloadHistory(
        sonarrMedia.id,
      );
      if (history.length === 0) {
        this.logger.debug(
          `[Sonarr] Skipping download cleanup for '${sonarrMedia.title}': no download history found.`,
        );
        return [];
      }

      const episodesByHash = new Map<string, Set<number | undefined>>();
      for (const item of history) {
        let episodes = episodesByHash.get(item.hash);
        if (!episodes) {
          episodes = new Set();
          episodesByHash.set(item.hash, episodes);
        }
        episodes.add(item.episodeId);
      }

      const covered: string[] = [];
      for (const [hash, episodes] of episodesByHash) {
        const fullyCovered = [...episodes].every(
          (episodeId) =>
            episodeId !== undefined && deletedEpisodeIds.has(episodeId),
        );
        if (fullyCovered) {
          covered.push(hash);
        } else {
          this.logger.debug(
            `[Sonarr] Keeping download ${hash} for '${sonarrMedia.title}': it also backs episodes outside this delete.`,
          );
        }
      }

      return covered;
    } catch (error) {
      this.logger.debug(
        `[Sonarr] Download cleanup coverage check failed for '${sonarrMedia.title}'; skipping. ${error}`,
      );
      return [];
    }
  }

  /**
   * The season's on-disk folder, for leftover cleanup — captured before the
   * delete since episode-file ids are consumed by it. Returns undefined (→ no
   * cleanup) when the series has no season folders (episodes live in the series
   * root, shared across seasons) or no episode file is found. The folder is the
   * parent of any one downloaded episode's file path; Sonarr's season-folder
   * naming is configurable, so it is read, never derived.
   */
  private async resolveSeasonFolder(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    sonarrMedia: SonarrSeries,
    seasonNumber: number | undefined,
  ): Promise<string | undefined> {
    try {
      if (!sonarrMedia.seasonFolder) {
        return undefined;
      }
      if (seasonNumber === undefined || seasonNumber === null) {
        return undefined;
      }
      const episodes = await sonarrApiClient.getEpisodes(
        sonarrMedia.id,
        seasonNumber,
      );
      const withFile = episodes.find((e) => e.episodeFileId);
      if (!withFile) {
        return undefined;
      }
      const file = await sonarrApiClient.getEpisodeFile(withFile.episodeFileId);
      if (!file?.path) {
        return undefined;
      }
      return dirname(file.path);
    } catch (error) {
      this.logger.debug(
        `[Sonarr] Couldn't resolve season folder for cleanup: ${error}`,
      );
      return undefined;
    }
  }

  private async cleanupSeriesFolder(
    seriesFolderPath: string | undefined,
    rootFolderPaths: string[],
    label: string | undefined,
  ): Promise<void> {
    await this.folderCleanup.cleanupAfterDelete({
      folderPath: seriesFolderPath,
      rootFolderPaths,
      scope: 'series',
      label,
    });
  }

  private async cleanupSeasonFolder(
    seasonFolderPath: string | undefined,
    seriesFolderPath: string | undefined,
    rootFolderPaths: string[],
    label: string | undefined,
  ): Promise<void> {
    await this.folderCleanup.cleanupAfterDelete({
      folderPath: seasonFolderPath,
      rootFolderPaths,
      scope: 'season',
      parentPath: seriesFolderPath,
      label,
    });
  }

  private getEpisodeLookup(mediaData?: MediaItem):
    | {
        seasonNumber: number;
        episodeNumbers: number[];
        airDate?: Date;
      }
    | undefined {
    if (mediaData?.parentIndex === undefined) {
      return undefined;
    }

    if (mediaData.index !== undefined) {
      return {
        seasonNumber: mediaData.parentIndex,
        episodeNumbers: [mediaData.index],
      };
    }

    if (mediaData.originallyAvailableAt) {
      return {
        seasonNumber: mediaData.parentIndex,
        episodeNumbers: [],
        airDate: mediaData.originallyAvailableAt,
      };
    }

    return undefined;
  }

  private getEpisodeLogLabel(mediaData?: MediaItem): string {
    if (mediaData?.index !== undefined) {
      return `episode ${mediaData.index}`;
    }

    if (mediaData?.originallyAvailableAt) {
      return `episode airing ${
        mediaData.originallyAvailableAt.toISOString().split('T')[0]
      }`;
    }

    return 'episode';
  }

  private async deleteShowIfEmpty(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
    tmdbId: number | undefined,
    removedSeasonNumber: number | undefined,
    listExclusions: boolean | undefined,
  ): Promise<void> {
    const series = await this.refetchSeries(sonarrApiClient, lookupCandidate);

    if (!series?.id) {
      this.logger.debug(
        `[Sonarr] Skipping empty-show cleanup: series refetch returned no result for ${lookupCandidate.providerKey} id ${lookupCandidate.id}`,
      );
      return;
    }

    if (!this.isShowEmpty(series, 'files')) {
      this.logger.debug(
        `[Sonarr] Show '${series.title}' still has ${series.statistics?.episodeFileCount ?? 0} episode file(s) - skipping show deletion`,
      );
      return;
    }

    const hasSeerrCheckInputs =
      tmdbId !== undefined && removedSeasonNumber !== undefined;

    if (this.seerrApi.isConfigured() && hasSeerrCheckInputs) {
      const hasRemainingRequests =
        await this.seerrApi.hasRemainingSeasonRequests(
          tmdbId,
          removedSeasonNumber,
        );

      if (hasRemainingRequests === true) {
        this.logger.debug(
          `[Sonarr] Show '${series.title}' has other active Seerr season requests - skipping show deletion`,
        );
        return;
      }

      if (hasRemainingRequests === undefined) {
        this.logger.debug(
          `[Sonarr] Show '${series.title}' Seerr state could not be determined - skipping show deletion`,
        );
        return;
      }

      await sonarrApiClient.deleteShow(series.id, true, listExclusions);
      this.logger.log(
        `[Sonarr] Show '${series.title}' has no files and no remaining Seerr season requests - deleted from Sonarr`,
      );
      return;
    }

    // No-Seerr fallback. The file gate above already proved the show has no
    // episode files; `ended` confirms no further episodes are coming. We do
    // NOT additionally require every season to be unmonitored: Sonarr carries
    // every TVDB season on the series, including ones the user never
    // downloaded, and those stay monitored forever — which would block
    // deletion of a genuinely empty, ended show indefinitely (issue #2757 /
    // #2891: e.g. a show where the user only ever had seasons 1-4).
    if (series.status !== 'ended') {
      this.logger.debug(
        `[Sonarr] Show '${series.title}' has no episode files but is not ended (status=${series.status}) - skipping show deletion`,
      );
      return;
    }

    await sonarrApiClient.deleteShow(series.id, true, listExclusions);
    this.logger.log(
      `[Sonarr] Show '${series.title}' is ended with no episode files remaining - deleted from Sonarr`,
    );
  }

  private async unmonitorShowIfEmptyAndEnded(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
  ): Promise<void> {
    const series = await this.refetchSeries(sonarrApiClient, lookupCandidate);

    if (!series) {
      this.logger.debug(
        `[Sonarr] Skipping empty-show unmonitor: series refetch returned no result for ${lookupCandidate.providerKey} id ${lookupCandidate.id}`,
      );
      return;
    }

    if (!this.isShowEmptyAndEnded(series, 'monitored')) {
      this.logger.debug(
        `[Sonarr] Show '${series.title}' is not ended or still has monitored seasons with files (status=${series.status}) - skipping show unmonitor`,
      );
      return;
    }

    series.monitored = false;
    await sonarrApiClient.updateSeries(series);
    this.logger.log(
      `[Sonarr] Show '${series.title}' is ended with no monitored seasons holding files - unmonitored show`,
    );
  }

  private async refetchSeries(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
  ): Promise<SonarrSeries | undefined> {
    switch (lookupCandidate.providerKey) {
      case 'tvdb':
        return sonarrApiClient.getSeriesByTvdbId(lookupCandidate.id);
      default:
        return undefined;
    }
  }

  private isShowEmptyAndEnded(
    series: SonarrSeries,
    mode: 'files' | 'monitored',
  ): boolean {
    return series.status === 'ended' && this.isShowEmpty(series, mode);
  }

  private isShowEmpty(
    series: SonarrSeries,
    mode: 'files' | 'monitored',
  ): boolean {
    if (mode === 'files') {
      return (series.statistics?.episodeFileCount ?? 0) === 0;
    }

    // 'monitored': the show counts as empty once no season is still both
    // monitored AND holding files. Seasons the user never downloaded stay
    // monitored on the series object indefinitely (Sonarr carries every TVDB
    // season) and have zero files — they must not count as monitored content,
    // or a genuinely finished show could never be unmonitored (#2757 / #2891).
    //
    // A monitored season is only treated as empty when Sonarr *explicitly*
    // reports zero files. season.statistics is optional; if it's absent the
    // file count is unknown, so the season is treated as still having content
    // (conservative — never unmonitor a show on an assumption).
    return series.seasons.every(
      (season) =>
        !season.monitored || season.statistics?.episodeFileCount === 0,
    );
  }
}
