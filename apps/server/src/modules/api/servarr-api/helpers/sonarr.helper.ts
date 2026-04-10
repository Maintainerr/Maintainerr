import { CONNECTION_TEST_TIMEOUT_MS } from '../../../../utils/connection-error';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { ServarrApi } from '../common/servarr-api.service';
import {
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrInfo,
  SonarrSeason,
  SonarrSeries,
} from '../interfaces/sonarr.interface';

export class SonarrApi extends ServarrApi<{
  seriesId: number;
  episodeId: number;
}> {
  constructor(
    {
      url,
      apiKey,
      cacheName,
    }: {
      url: string;
      apiKey: string;
      cacheName?: string;
    },
    protected readonly logger: MaintainerrLogger,
  ) {
    super({ url, apiKey, cacheName }, logger);
    this.logger.setContext(SonarrApi.name);
  }

  public async getSeries(): Promise<SonarrSeries[]> {
    try {
      const response = await this.get<SonarrSeries[]>('/series');

      return response;
    } catch (error) {
      this.logger.warn('Failed to retrieve series');
      this.logger.debug(error);
    }
  }

  public async getEpisodes(
    seriesID: number,
    seasonNumber?: number,
    episodeNumbers?: number[],
  ): Promise<SonarrEpisode[]> {
    try {
      const response = await this.fetchEpisodes(seriesID, seasonNumber);

      if (episodeNumbers !== undefined) {
        const validEpisodeNumbers =
          this.filterDefinedEpisodeNumbers(episodeNumbers);

        return validEpisodeNumbers.length
          ? response.filter((el) =>
              validEpisodeNumbers.includes(el.episodeNumber),
            )
          : [];
      }

      return response;
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve show ${seriesID}'s episodes ${this.formatEpisodeLookup(episodeNumbers)}: ${error.message}`,
      );
      this.logger.debug(error);
      throw error;
    }
  }
  public async getEpisodeFile(
    episodeFileId: number,
  ): Promise<SonarrEpisodeFile> {
    try {
      const response = await this.get<SonarrEpisodeFile>(
        `/episodefile/${episodeFileId}`,
      );

      return response;
    } catch (error) {
      this.logger.warn(`Failed to retrieve episode file id ${episodeFileId}`);
      this.logger.debug(error);
    }
  }

  public async getSeriesByTitle(title: string): Promise<SonarrSeries[]> {
    try {
      const response = await this.get<SonarrSeries[]>('/series/lookup', {
        params: {
          term: title,
        },
      });

      if (!response[0]) {
        this.logger.warn(`Series not found`);
      }

      return response;
    } catch (error) {
      this.logger.warn(`Error retrieving series by series title '${title}'`);
      this.logger.debug(error);
    }
  }

  public async getSeriesByTvdbId(id: number): Promise<SonarrSeries> {
    try {
      const response = await this.get<SonarrSeries[]>(`/series?tvdbId=${id}`);

      if (!response?.[0]) {
        this.logger.warn(`Could not retrieve show by tvdb ID ${id}`);
        return undefined;
      }

      return response[0];
    } catch (error) {
      this.logger.warn(`Error retrieving show by tvdb ID ${id}`);
      this.logger.debug(error);
    }
  }

  public async updateSeries(series: SonarrSeries): Promise<boolean> {
    return this.runPut('series', JSON.stringify(series));
  }

  public async searchSeries(seriesId: number): Promise<void> {
    this.logger.log(
      `Executing series search command for seriesId ${seriesId}.`,
    );

    try {
      await this.runCommand('SeriesSearch', { seriesId });
    } catch (error) {
      this.logger.log(
        `Something went wrong while executing Sonarr series search for series Id ${seriesId}`,
      );
      this.logger.debug(error);
    }
  }

  public async deleteShow(
    seriesId: number | string,
    deleteFiles = true,
    importListExclusion = false,
  ): Promise<boolean> {
    this.logger.log(`Deleting show with ID ${seriesId} from Sonarr.`);
    try {
      return await this.runDelete(
        `series/${seriesId}?deleteFiles=${deleteFiles}&addImportListExclusion=${importListExclusion}`,
      );
    } catch (error) {
      this.logger.log(
        `Couldn't delete show by ID ${seriesId}. Does it exist in Sonarr?`,
      );
      this.logger.debug(error);
      return false;
    }
  }

  public async UnmonitorDeleteEpisodes(
    seriesId: number,
    seasonNumber: number,
    episodeIds: number[],
    deleteFiles = true,
    airDate?: string | Date,
  ): Promise<boolean> {
    const validEpisodeIds = this.filterDefinedEpisodeNumbers(episodeIds);

    if (!validEpisodeIds.length && !airDate) {
      this.logger.warn(
        `Couldn't remove/unmonitor episodes for series ID ${seriesId}: no episode identifier was provided.`,
      );
      return false;
    }

    this.logger.log(
      `${!deleteFiles ? 'Unmonitoring' : 'Deleting'} ${
        validEpisodeIds.length || (airDate ? 1 : 0)
      } episode(s) from show with ID ${seriesId} from Sonarr.`,
    );
    try {
      const episodes = await this.getEpisodes(seriesId, seasonNumber);

      const matchedEpisodes = this.findEpisodesForAction(
        episodes,
        validEpisodeIds,
        airDate,
      );

      if (!matchedEpisodes.length) {
        this.logger.warn(
          `Couldn't remove/unmonitor episodes for series ID ${seriesId}: no matching episodes found for ${this.formatEpisodeLookup(validEpisodeIds, airDate)}.`,
        );
        return false;
      }

      for (const e of matchedEpisodes) {
        if (
          !(await this.runPut(
            `episode/${e.id}`,
            JSON.stringify({ ...e, monitored: false }),
          ))
        ) {
          return false;
        }

        if (deleteFiles && e.episodeFileId) {
          if (!(await this.runDelete(`episodefile/${e.episodeFileId}`))) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      this.logger.warn(
        `Couldn't remove/unmonitor episodes: ${this.formatEpisodeLookup(validEpisodeIds, airDate)} for series ID: ${seriesId}`,
      );
      this.logger.debug(error);
      return false;
    }
  }

  public async unmonitorSeasons(
    seriesId: number | string,
    type: 'all' | number | 'existing' = 'all',
    deleteFiles = true,
    forceExisting = false,
  ): Promise<SonarrSeries | undefined> {
    try {
      const data: SonarrSeries = (await this.axios.get(`series/${seriesId}`))
        .data;

      const episodes = await this.getEpisodes(+seriesId);
      let success = true;

      data.seasons = await Promise.all(
        data.seasons.map(async (s) => {
          if (type === 'all') {
            s.monitored = false;
          } else if (
            type === 'existing' ||
            (forceExisting && type === s.seasonNumber)
          ) {
            for (const e of episodes) {
              if (e.seasonNumber === s.seasonNumber && e.episodeFileId) {
                success =
                  (await this.UnmonitorDeleteEpisodes(
                    +seriesId,
                    e.seasonNumber,
                    [e.episodeNumber],
                    false,
                  )) && success;
              }
            }
          } else if (typeof type === 'number') {
            if (s.seasonNumber === type) {
              s.monitored = false;
            }
          }
          return s;
        }),
      );
      success = (await this.runPut(`series/`, JSON.stringify(data))) && success;

      if (deleteFiles) {
        for (const e of episodes) {
          if (typeof type === 'number') {
            if (e.seasonNumber === type && e.episodeFileId) {
              success =
                (await this.runDelete(`episodefile/${e.episodeFileId}`)) &&
                success;
            }
          } else if (e.episodeFileId) {
            success =
              (await this.runDelete(`episodefile/${e.episodeFileId}`)) &&
              success;
          }
        }
      }

      if (!success) {
        return undefined;
      }

      this.logger.log(
        `Unmonitored ${
          typeof type === 'number' ? `season ${type}` : 'seasons'
        } from Sonarr show with ID ${seriesId}`,
      );

      return data;
    } catch (error) {
      this.logger.log(
        `Couldn't unmonitor/delete seasons for series ID ${seriesId}. Does it exist in Sonarr?`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  private buildSeasonList(
    seasons: number[],
    existingSeasons?: SonarrSeason[],
  ): SonarrSeason[] {
    if (existingSeasons) {
      const newSeasons = existingSeasons.map((season) => {
        if (seasons.includes(season.seasonNumber)) {
          season.monitored = true;
        }
        return season;
      });

      return newSeasons;
    }

    const newSeasons = seasons.map(
      (seasonNumber): SonarrSeason => ({
        seasonNumber,
        monitored: true,
      }),
    );

    return newSeasons;
  }

  public async info(): Promise<SonarrInfo> {
    try {
      const info: SonarrInfo = (
        await this.axios.get(`system/status`, {
          signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
        })
      ).data;
      return info ? info : null;
    } catch (error) {
      this.logger.warn("Couldn't fetch Sonarr info.. Is Sonarr up?");
      this.logger.debug(error);
      return null;
    }
  }

  private normalizeAirDate(airDate?: string | Date): string | undefined {
    if (!airDate) {
      return undefined;
    }

    if (airDate instanceof Date) {
      return Number.isNaN(airDate.getTime())
        ? undefined
        : airDate.toISOString().split('T')[0];
    }

    return airDate.split('T')[0];
  }

  private formatEpisodeLookup(
    episodeIds?: number[],
    airDate?: string | Date,
  ): string {
    const validEpisodeIds = this.filterDefinedEpisodeNumbers(episodeIds);

    if (validEpisodeIds.length) {
      return validEpisodeIds.join(', ');
    }

    return this.normalizeAirDate(airDate) ?? '';
  }

  private async fetchEpisodes(
    seriesID: number,
    seasonNumber?: number,
  ): Promise<SonarrEpisode[]> {
    return this.get<SonarrEpisode[]>(
      `/episode?seriesId=${seriesID}${
        seasonNumber ? `&seasonNumber=${seasonNumber}` : ''
      }`,
    );
  }

  private findEpisodesForAction(
    episodes: SonarrEpisode[],
    episodeIds: number[],
    airDate?: string | Date,
  ): SonarrEpisode[] {
    if (episodeIds.length) {
      return episodes.filter((episode) =>
        episodeIds.includes(episode.episodeNumber),
      );
    }

    const normalizedAirDate = this.normalizeAirDate(airDate);

    return normalizedAirDate
      ? episodes.filter((episode) => episode.airDate === normalizedAirDate)
      : [];
  }

  private filterDefinedEpisodeNumbers(episodeIds?: number[]): number[] {
    return (
      episodeIds?.filter(
        (episodeId): episodeId is number => episodeId !== undefined,
      ) ?? []
    );
  }
}
