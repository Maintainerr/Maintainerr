import { MetadataDetails } from './metadata.types';

/**
 * A metadata provider that can supply normalised details and images.
 * Implemented by each concrete provider (TMDB, TVDB, etc.).
 * MetadataService iterates providers in preference order with automatic fallback.
 */
export interface IMetadataProvider {
  /** Human-readable name (for logging). */
  readonly name: string;

  /** Whether this provider is configured and ready for API calls. */
  isAvailable(): boolean;

  /** Pick out the ID this provider uses from a bag of resolved IDs. */
  extractId(ids: { tmdbId?: number; tvdbId?: number }): number | undefined;

  /** Normalised movie details. */
  getMovieDetails(id: number): Promise<MetadataDetails | undefined>;

  /** Normalised TV show details. */
  getTvShowDetails(id: number): Promise<MetadataDetails | undefined>;

  /** Full poster image URL. `sizeHint` is provider-specific (ignored when N/A). */
  getPosterUrl(
    id: number,
    type: 'movie' | 'tv',
    sizeHint?: string,
  ): Promise<string | undefined>;

  /** Full backdrop/fanart image URL. `sizeHint` is provider-specific. */
  getBackdropUrl(
    id: number,
    type: 'movie' | 'tv',
    sizeHint?: string,
  ): Promise<string | undefined>;
}
