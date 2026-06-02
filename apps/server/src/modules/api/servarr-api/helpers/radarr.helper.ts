import { CONNECTION_TEST_TIMEOUT_MS } from '../../../../utils/connection-error';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { ServarrApi } from '../common/servarr-api.service';
import {
  RadarrImportListExclusion,
  RadarrInfo,
  RadarrMovie,
  RadarrMovieFile,
} from '../interfaces/radarr.interface';

export class RadarrApi extends ServarrApi<{ movieId: number }> {
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
    this.logger.setContext(ServarrApi.name);
  }

  public getMovies = async (): Promise<RadarrMovie[]> => {
    try {
      const response = await this.get<RadarrMovie[]>('/movie');

      return response;
    } catch (error) {
      this.logger.warn('Failed to retrieve movies');
      this.logger.debug(error);
    }
  };

  public getMovie = async ({ id }: { id: number }): Promise<RadarrMovie> => {
    try {
      const response = await this.get<RadarrMovie>(`/movie/${id}`);
      return response;
    } catch (error) {
      this.logger.warn(`Failed to retrieve movie with id ${id}`);
      this.logger.debug(error);
    }
  };

  // Intentionally uncached: this drives rule evaluation and resolves the
  // movie that actions then mutate — both need Radarr's current truth, not a
  // snapshot that can be up to DEFAULT_TTL stale.
  public async getMovieByTmdbId(id: number): Promise<RadarrMovie> {
    try {
      const response = await this.getWithoutCache<RadarrMovie[]>(
        `/movie?tmdbId=${id}`,
      );

      if (!response[0]) {
        this.logger.warn(`Could not find Movie with TMDb id ${id} in Radarr`);
      }

      return response[0];
    } catch (error) {
      this.logger.warn(`Error retrieving movie by TMDb ID ${id}`);
      this.logger.debug(error);
    }
  }

  public async searchMovie(movieId: number): Promise<void> {
    this.logger.log('Executing movie search command');

    try {
      await this.runCommand('MoviesSearch', { movieIds: [movieId] });
    } catch (error) {
      this.logger.warn(
        'Something went wrong while executing Radarr movie search.',
      );
      this.logger.debug(error);
    }
  }

  public async deleteMovie(
    movieId: number,
    deleteFiles = true,
    importExclusion = false,
  ): Promise<boolean> {
    try {
      return await this.runDelete(
        `movie/${movieId}?deleteFiles=${deleteFiles}&addImportExclusion=${importExclusion}`,
      );
    } catch (error) {
      this.logger.log("Couldn't delete movie. Does it exist in radarr?");
      this.logger.debug(error);
      return false;
    }
  }

  public async updateMovie(
    movieId: number,
    options: {
      deleteFiles?: boolean;
      monitored?: boolean;
      addImportExclusion?: boolean;
      qualityProfileId?: number;
    },
  ): Promise<boolean> {
    try {
      const movieData: RadarrMovie = await this.getWithoutCache(
        `movie/${movieId}`,
      );

      if (!movieData) {
        return false;
      }

      if (options?.monitored !== undefined) {
        movieData.monitored = options.monitored;
      }
      if (options?.qualityProfileId !== undefined) {
        movieData.qualityProfileId = options.qualityProfileId;
      }
      if (!(await this.runPut(`movie/${movieId}`, JSON.stringify(movieData)))) {
        return false;
      }

      if (options?.deleteFiles) {
        const movieFiles: RadarrMovieFile[] = await this.getWithoutCache(
          `moviefile?movieId=${movieId}`,
        );
        for (const movieFile of movieFiles ?? []) {
          if (!(await this.runDelete(`moviefile/${movieFile.id}`))) {
            return false;
          }
        }
      }

      if (options?.addImportExclusion) {
        // Use the bulk endpoint, not the singular POST /exclusions: the latter
        // runs a validator that rejects an already-excluded movie with HTTP 400
        // ("This exclusion has already been added"), which would fail the whole
        // collection run on every re-run. /exclusions/bulk skips that validator
        // and de-dupes server-side (the same idempotent behaviour as Radarr's
        // movie-delete path and Sonarr's exclusion handling), so re-adding is a
        // no-op.
        const result = await this.post<RadarrImportListExclusion[]>(
          `/exclusions/bulk`,
          [
            {
              tmdbId: movieData.tmdbId,
              movieTitle: movieData.title,
              movieYear: movieData.year,
            } satisfies RadarrImportListExclusion,
          ],
        );

        // post() returns the body on success and undefined only on a failed
        // request. Radarr's bulk endpoint documents 200 with no response schema,
        // so a successful add can have an empty body ('') — check for undefined
        // rather than falsiness so an empty-body success isn't read as failure.
        if (result === undefined) {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.warn("Couldn't unmonitor movie. Does it exist in radarr?");
      this.logger.debug(error);
      return false;
    }
  }

  public async info(): Promise<RadarrInfo> {
    try {
      const info: RadarrInfo = (
        await this.axios.get<RadarrInfo>(`system/status`, {
          signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
        })
      ).data;
      return info ? info : null;
    } catch (error) {
      this.logger.warn("Couldn't fetch Radarr info.. Is Radarr up?");
      this.logger.debug(error);
      return null;
    }
  }
}
