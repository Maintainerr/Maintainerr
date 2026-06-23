import { CONNECTION_TEST_TIMEOUT_MS } from '../../../../utils/connection-error';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { ServarrApi } from '../common/servarr-api.service';
import {
  DownloadHistoryItem,
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrInfo,
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Failed to retrieve show ${seriesID}'s episodes ${this.formatEpisodeLookup(episodeNumbers)}: ${errorMessage}`,
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

  // Intentionally uncached: this endpoint is read straight after mutations
  // (unmonitor + file deletes) by the empty-show cleanup, and also drives
  // rule evaluation — both need Sonarr's current truth, not a snapshot that
  // can be up to DEFAULT_TTL stale (see issue #2757 / #2891).
  // Returns `null` when Sonarr confirms the series isn't tracked (empty
  // response) and `undefined` when the lookup itself failed (transport, auth,
  // 5xx). Callers must keep these distinct: a confirmed miss is safe to fall
  // back from, a failure must fail closed so a transient Sonarr outage can't
  // silently change rule evaluation.
  public async getSeriesByTvdbId(
    id: number,
  ): Promise<SonarrSeries | null | undefined> {
    try {
      const response = await this.getWithoutCache<SonarrSeries[]>(
        `/series?tvdbId=${id}`,
      );

      // getWithoutCache swallows transport/auth/5xx into `undefined` (it never
      // throws), so the catch below can't see those failures. Distinguish them
      // here and fail closed (undefined), rather than letting the empty check
      // collapse a transient outage into `null` ("not tracked"). (#3125)
      if (response === undefined) {
        this.logger.warn(`Error retrieving show by tvdb ID ${id}`);
        return undefined;
      }

      if (!response[0]) {
        this.logger.warn(`Could not retrieve show by tvdb ID ${id}`);
        return null;
      }

      return response[0];
    } catch (error) {
      this.logger.warn(`Error retrieving show by tvdb ID ${id}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  public async updateSeries(series: SonarrSeries): Promise<boolean> {
    return this.runPut('series', JSON.stringify(series));
  }

  /**
   * Add or remove a single tag on a batch of series via the series editor.
   * `applyTags: 'add' | 'remove'` only — never 'replace', which would wipe every
   * other tag the user has on those series. Best-effort: returns false on failure
   * (callers treat tagging as non-fatal). No-ops on an empty id list. Sonarr tags
   * are series-level; there is no per-season tag.
   */
  public async setSeriesTags(
    seriesIds: number[],
    tagId: number,
    mode: 'add' | 'remove',
  ): Promise<boolean> {
    if (seriesIds.length === 0) {
      return true;
    }

    return this.runPut(
      'series/editor',
      JSON.stringify({ seriesIds, tags: [tagId], applyTags: mode }),
    );
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

  /**
   * The distinct torrent infohashes that produced this series' files, for a
   * whole-show delete. Derived from the same grab/import-filtered history as the
   * coverage path, so a torrent that only ever failed for this series isn't
   * removed.
   */
  public async getDownloadIdsForSeries(seriesId: number): Promise<string[]> {
    const history = await this.getSeriesDownloadHistory(seriesId);
    return [...new Set(history.map((item) => item.hash))];
  }

  /**
   * Per-torrent episode coverage from a series' Sonarr history: one item per
   * grab/import event, giving the torrent infohash and the episode it backed.
   * Used by season/episode deletes to remove only torrents whose every backed
   * episode is being deleted. Never throws (returns [] on failure).
   */
  public async getSeriesDownloadHistory(
    seriesId: number,
  ): Promise<DownloadHistoryItem[]> {
    const records = await this.getHistoryRecords(
      `/history/series?seriesId=${seriesId}`,
    );

    const items: DownloadHistoryItem[] = [];
    for (const record of records) {
      const hash = this.downloadProducingHash(record);
      if (hash) {
        items.push({ hash, episodeId: record.episodeId });
      }
    }

    return items;
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

      this.logger.log(
        `${!deleteFiles ? 'Unmonitoring' : 'Deleting'} ${
          matchedEpisodes.length
        } episode(s) from show with ID ${seriesId} from Sonarr.`,
      );

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
        seasonNumber !== undefined ? `&seasonNumber=${seasonNumber}` : ''
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
