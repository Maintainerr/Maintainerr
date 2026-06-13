import { isAxiosError } from 'axios';
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

  /**
   * Resolve the torrent infohashes (download-client `downloadId`s) that produced
   * this movie's files, from Radarr's history. Used to clean up the matching
   * torrents in the download client after a delete.
   */
  public async getDownloadIdsForMovie(movieId: number): Promise<string[]> {
    return this.getDownloadIdsFromHistory(`/history/movie?movieId=${movieId}`);
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
        if (!(await this.addImportExclusion(movieData))) {
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

  /**
   * Add a movie to Radarr's import-list exclusions via the bulk endpoint, which
   * de-dupes server-side when a request reaches its service layer.
   *
   * Letting Radarr handle duplicates is not enough on its own: since Radarr
   * v5.26.2 (RestController.OnActionExecuting now unpacks and validates
   * IEnumerable bodies) the controller's ImportListExclusionExistsValidator runs
   * on every posted resource and throws HTTP 400 ("This exclusion has already
   * been added") *before* the request reaches that server-side de-dup. The
   * singular POST /exclusions always validated, so neither endpoint avoids the
   * duplicate 400 (#3084).
   *
   * Adding the exclusion is best-effort and our goal is only "the movie is
   * excluded", which an already-excluded 400 already satisfies. So treat a 400 as
   * success rather than failing the whole collection action (its unmonitor/delete
   * has already run) on every re-run. Other failures still return false. We post a
   * single-movie array, so a 400 unambiguously means that one movie is already
   * excluded.
   *
   * Goes through the shared post() client (rethrowing so we can read the status)
   * rather than this.axios directly, keeping the outbound request on the one HTTP
   * client the rest of servarr uses.
   */
  private async addImportExclusion(movie: RadarrMovie): Promise<boolean> {
    try {
      await this.post(
        '/exclusions/bulk',
        [
          {
            tmdbId: movie.tmdbId,
            movieTitle: movie.title,
            movieYear: movie.year,
          } satisfies RadarrImportListExclusion,
        ],
        undefined,
        { rethrow: true },
      );
      return true;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 400) {
        this.logger.debug(
          `Movie tmdbId ${movie.tmdbId} is already in Radarr's import exclusion list`,
        );
        return true;
      }
      this.logger.warn('Failed to add movie to Radarr import exclusion list');
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
