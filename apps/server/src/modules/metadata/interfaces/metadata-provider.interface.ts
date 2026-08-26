import {
  ExternalIdSearchResult,
  MetadataDetails,
  MetadataImageOptions,
  PersonDetails,
  ProviderIds,
  TvHierarchyRef,
} from './metadata.types';

export const MetadataProviders = Symbol('MetadataProviders');

export interface IMetadataProvider {
  readonly name: string;
  readonly idKey: string;

  isAvailable(): boolean;

  extractId(ids: ProviderIds): number | undefined;

  assignId(ids: ProviderIds, id: number): void;

  /**
   * The provider's numeric id from the string a media server carries for it.
   * Undefined when the string is not one of this provider's ids.
   */
  parseId(value: string): number | undefined;

  /**
   * True when this provider is the authority for an item that carries its id,
   * so it answers ahead of the primary preference. A provider that serves only
   * its own namespace claims the item; the general providers never do.
   */
  isAuthorityFor(ids: ProviderIds): boolean;

  getDetails(
    id: number,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined>;

  /**
   * `ref` asks for that season's poster; episodes get their season's poster
   * because neither provider holds a portrait image per episode. Providers fall
   * back to the show poster when they have no artwork for the season.
   */
  getPosterUrl(
    id: number,
    type: 'movie' | 'tv',
    options?: MetadataImageOptions,
  ): Promise<string | undefined>;

  /**
   * `ref` asks for the episode's still. Providers with no landscape image for
   * what `ref` addresses - a season, or an episode they don't hold a still for
   * - fall back to the show backdrop.
   */
  getBackdropUrl(
    id: number,
    type: 'movie' | 'tv',
    options?: MetadataImageOptions,
  ): Promise<string | undefined>;

  /**
   * Description of the episode `ref` addresses, or of the season when it
   * addresses a whole season. Undefined when the provider has none.
   */
  getHierarchyOverview(
    id: number,
    ref: TvHierarchyRef,
  ): Promise<string | undefined>;

  getPersonDetails(id: number): Promise<PersonDetails | undefined>;

  findByExternalId(
    externalId: string | number,
    type: string,
  ): Promise<ExternalIdSearchResult[] | undefined>;
}
