import {
  ExternalIdSearchResult,
  MetadataDetails,
  PersonDetails,
  ProviderIds,
} from './metadata.types';

/** NestJS injection token for the array of all registered metadata providers. */
export const MetadataProviders = Symbol('MetadataProviders');

/**
 * A metadata provider that can supply normalised details and images.
 * Implemented by each concrete provider (TMDB, TVDB, etc.).
 * MetadataService iterates providers in preference order with automatic fallback.
 *
 * Adding a new provider without provider-specific branching in MetadataService:
 * 1. Create the API service in modules/api/xxx-api/
 * 2. Create a provider class implementing IMetadataProvider
 *    (copy an existing provider as a template, e.g. tmdb-metadata.provider.ts)
 * 3. In MetadataModule: import its API module, register the class,
 *    and add it to the MetadataProviders useFactory array
 * 4. Add one enum value to MetadataProviderPreference in @maintainerr/contracts
 *    (e.g. FANART_PRIMARY = 'fanart_primary') — the value prefix must match
 *    the provider's `name` field (case-insensitive)
 */
export interface IMetadataProvider {
  /** Human-readable name (for logging). */
  readonly name: string;

  /** Key used in ProviderIds and MediaProviderIds (e.g. 'tmdb', 'tvdb'). */
  readonly idKey: string;

  /** Whether this provider is configured and ready for API calls. */
  isAvailable(): boolean;

  /** Pick out the ID this provider uses from a bag of resolved IDs. */
  extractId(ids: ProviderIds): number | undefined;

  /** Write this provider's ID into a bag of resolved IDs (inverse of extractId). */
  assignId(ids: ProviderIds, id: number): void;

  /** Normalised movie or TV show details. */
  getDetails(
    id: number,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined>;

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

  /** Normalised person details (actor, director, etc.). */
  getPersonDetails(id: number): Promise<PersonDetails | undefined>;

  /**
   * Search for entries by an external ID (e.g. IMDB, TVDB, TMDB).
   * Return undefined for unsupported ID types.
   * Used by MetadataService for cross-provider ID resolution.
   */
  findByExternalId(
    externalId: string | number,
    type: string,
  ): Promise<ExternalIdSearchResult[] | undefined>;
}
