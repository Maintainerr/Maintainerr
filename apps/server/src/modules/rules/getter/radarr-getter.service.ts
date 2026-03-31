import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MetadataService } from '../../metadata/metadata.service';
import {
  findServarrLookupMatch,
  formatServarrLookupCandidates,
  ServarrLookupCandidate,
} from '../../metadata/servarr-lookup.util';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RulesDto } from '../dtos/rules.dto';
import { evaluateArrDiskspaceGiB } from '../helpers/diskspace.utils';

@Injectable()
export class RadarrGetterService {
  plexProperties: Property[];
  constructor(
    private readonly servarrService: ServarrService,
    private readonly metadataService: MetadataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RadarrGetterService.name);
    const ruleConstanst = new RuleConstants();
    this.plexProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.RADARR,
    ).props;
  }

  async get(
    id: number,
    libItem: MediaItem,
    ruleGroup?: RulesDto,
    rule?: RuleDto,
  ) {
    if (!ruleGroup.collection?.radarrSettingsId) {
      this.logger.error(
        `No Radarr server configured for ${ruleGroup.collection?.title}`,
      );
      return null;
    }

    try {
      const prop = this.plexProperties.find((el) => el.id === id);

      // ARR diskspace check doesn't require a movie lookup - handle early
      if (
        prop?.name === 'diskspace_remaining_gb' ||
        prop?.name === 'diskspace_total_gb'
      ) {
        const radarrApiClient = await this.servarrService.getRadarrApiClient(
          ruleGroup.collection.radarrSettingsId,
        );
        return await evaluateArrDiskspaceGiB(
          radarrApiClient,
          prop.name,
          rule,
          'Radarr',
          this.logger.warn.bind(this.logger),
        );
      }

      const lookupCandidates =
        await this.findLookupCandidatesFromMediaItem(libItem);

      if (lookupCandidates.length === 0) {
        this.logger.warn(
          `Failed to resolve external IDs for '${libItem.title}' with id '${libItem.id}'. As a result, no Radarr query could be made.`,
        );
        return null;
      }

      const radarrApiClient = await this.servarrService.getRadarrApiClient(
        ruleGroup.collection.radarrSettingsId,
      );

      const matchedResult = await findServarrLookupMatch(lookupCandidates, {
        tmdb: (lookupId) => radarrApiClient.getMovieByTmdbId(lookupId),
        tvdb: (lookupId) => radarrApiClient.getMovieByTvdbId(lookupId),
      });
      const movieResponse = matchedResult?.result;

      if (!movieResponse) {
        const attemptedIds = formatServarrLookupCandidates(lookupCandidates);

        this.logger.warn(
          `None of the resolved external IDs [${attemptedIds}] for '${libItem.title}' matched a movie in Radarr.`,
        );
        return null;
      }

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
          `Couldn't fetch Radarr metadata for media '${libItem.title}' with id '${libItem.id}'. As a result, no Radarr query could be made.`,
        );
        return null;
      }
    } catch (error) {
      this.logger.warn(
        `Radarr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(
        `Radarr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
        error,
      );
      return undefined;
    }
  }

  public async findLookupCandidatesFromMediaItem(
    libItem: MediaItem,
  ): Promise<ServarrLookupCandidate[]> {
    const ids = await this.metadataService.resolveIdsFromMediaItem(libItem);

    return this.metadataService.buildServarrLookupCandidates({
      tmdb: ids?.tmdb as number | undefined,
      tvdb: ids?.tvdb as number | undefined,
    });
  }
}
