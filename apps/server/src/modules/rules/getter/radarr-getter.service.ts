import { Injectable } from '@nestjs/common';
import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { TmdbIdService } from '../../api/tmdb-api/tmdb-id.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';

@Injectable()
export class RadarrGetterService {
  private static readonly BYTES_PER_GIB = 1024 * 1024 * 1024;
  private static readonly ALL_ROOT_FOLDERS_VALUE = '__ALL__';
  plexProperties: Property[];
  constructor(
    private readonly servarrService: ServarrService,
    private readonly tmdbIdHelper: TmdbIdService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RadarrGetterService.name);
    const ruleConstanst = new RuleConstants();
    this.plexProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.RADARR,
    ).props;
  }

  async get(id: number, libItem: PlexLibraryItem, ruleGroup?: RulesDto) {
    if (!ruleGroup.collection?.radarrSettingsId) {
      this.logger.error(
        `No Radarr server configured for ${ruleGroup.collection?.title}`,
      );
      return null;
    }

    try {
      const prop = this.plexProperties.find((el) => el.id === id);
      const rawselectedPaths =
        ruleGroup?.collection?.selectedPaths ?? [];
      const allRootFoldersSelected = rawselectedPaths.includes(
        RadarrGetterService.ALL_ROOT_FOLDERS_VALUE,
      );
      const selectedPaths = rawselectedPaths.filter(
          (path) =>
            path &&
            path.trim().length > 0 &&
            path !== RadarrGetterService.ALL_ROOT_FOLDERS_VALUE,
        );

      const radarrApiClient = await this.servarrService.getRadarrApiClient(
        ruleGroup.collection.radarrSettingsId,
      );

      if (prop?.name === 'spaceAvailableGib') {
        const diskSpaces = await radarrApiClient.getDiskSpace();
        if (!diskSpaces?.length) {
          return null;
        }

        const diskSpaceByPath = new Map(
          diskSpaces.map((diskSpace) => [diskSpace.path.toLowerCase(), diskSpace]),
        );

        const matchingDiskSpaces =
          allRootFoldersSelected || selectedPaths.length === 0
            ? diskSpaces
            : selectedPaths
                .map((selectedPath) =>
                  diskSpaceByPath.get(selectedPath.toLowerCase()),
                )
                .filter(
                  (diskSpace): diskSpace is (typeof diskSpaces)[number] =>
                    Boolean(diskSpace),
                );

        if (!matchingDiskSpaces.length) {
          return null;
        }

        const totalFreeSpaceBytes = matchingDiskSpaces.reduce(
          (sum, diskSpace) => sum + (diskSpace.freeSpace ?? 0),
          0,
        );

        return (
          Math.round(
            (totalFreeSpaceBytes / RadarrGetterService.BYTES_PER_GIB) * 100,
          ) / 100
        );
      }

      const tmdb = await this.tmdbIdHelper.getTmdbIdFromPlexRatingKey(
        libItem.ratingKey,
      );

      if (!tmdb || !tmdb.id) {
        this.logger.warn(
          `[TMDb] Failed to fetch TMDb id for '${libItem.title}'`,
        );
        return null;
      }

      const movieResponse = await radarrApiClient.getMovieByTmdbId(tmdb.id);
      if (movieResponse) {
        switch (prop.name) {
          case 'addDate': {
            return movieResponse.added ? new Date(movieResponse.added) : null;
          }
          case 'fileDate': {
            return movieResponse.movieFile?.dateAdded
              ? new Date(movieResponse.movieFile.dateAdded)
              : null;
          }
          case 'filePath': {
            return movieResponse.movieFile?.path
              ? movieResponse.movieFile.path
              : null;
          }
          case 'fileQuality': {
            return movieResponse.movieFile?.quality?.quality?.resolution
              ? movieResponse.movieFile.quality.quality.resolution
              : null;
          }
          case 'fileAudioChannels': {
            return movieResponse.movieFile
              ? movieResponse.movieFile.mediaInfo?.audioChannels
              : null;
          }
          case 'runTime': {
            if (movieResponse.movieFile?.mediaInfo?.runTime) {
              const hms = movieResponse.movieFile.mediaInfo.runTime;
              const splitted = hms.split(':');
              return +splitted[0] * 60 + +splitted[1];
            }
            return null;
          }
          case 'monitored': {
            return movieResponse.monitored ? 1 : 0;
          }
          case 'tags': {
            const movieTags = movieResponse.tags;
            return (await radarrApiClient.getTags())
              ?.filter((el) => movieTags.includes(el.id))
              .map((el) => el.label);
          }
          case 'profile': {
            const movieProfile = movieResponse.qualityProfileId;

            return (await radarrApiClient.getProfiles())?.find(
              (el) => el.id === movieProfile,
            ).name;
          }
          case 'fileSize': {
            return movieResponse.sizeOnDisk
              ? Math.round(movieResponse.sizeOnDisk / 1048576)
              : movieResponse.movieFile?.size
                ? Math.round(movieResponse.movieFile.size / 1048576)
                : null;
          }
          case 'releaseDate': {
            return movieResponse.physicalRelease && movieResponse.digitalRelease
              ? (await new Date(movieResponse.physicalRelease)) >
                new Date(movieResponse.digitalRelease)
                ? new Date(movieResponse.digitalRelease)
                : new Date(movieResponse.physicalRelease)
              : movieResponse.physicalRelease
                ? new Date(movieResponse.physicalRelease)
                : movieResponse.digitalRelease
                  ? new Date(movieResponse.digitalRelease)
                  : null;
          }
          case 'inCinemas': {
            return movieResponse.inCinemas
              ? new Date(movieResponse.inCinemas)
              : null;
          }
          case 'originalLanguage': {
            return movieResponse.originalLanguage?.name
              ? movieResponse.originalLanguage.name
              : null;
          }
          case 'rottenTomatoesRating': {
            return movieResponse.ratings.rottenTomatoes?.value ?? null;
          }
          case 'rottenTomatoesRatingVotes': {
            return movieResponse.ratings.rottenTomatoes?.votes ?? null;
          }
          case 'traktRating': {
            return movieResponse.ratings.trakt?.value ?? null;
          }
          case 'traktRatingVotes': {
            return movieResponse.ratings.trakt?.votes ?? null;
          }
          case 'imdbRating': {
            return movieResponse.ratings.imdb?.value ?? null;
          }
          case 'imdbRatingVotes': {
            return movieResponse.ratings.imdb?.votes ?? null;
          }
          case 'fileQualityCutoffMet': {
            return movieResponse.movieFile?.qualityCutoffNotMet != null
              ? !movieResponse.movieFile.qualityCutoffNotMet
              : false;
          }
          case 'fileQualityName': {
            return movieResponse.movieFile?.quality?.quality?.name ?? null;
          }
          case 'fileAudioLanguages': {
            return movieResponse.movieFile?.mediaInfo?.audioLanguages ?? null;
          }
        }
      } else {
        this.logger.debug(
          `Couldn't fetch Radarr metadate for media '${libItem.title}' with id '${libItem.ratingKey}'. As a result, no Radarr query could be made.`,
        );
        return null;
      }
    } catch (e) {
      this.logger.warn(
        `Radarr-Getter - Action failed for '${libItem.title}' with id '${libItem.ratingKey}': ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }
}
