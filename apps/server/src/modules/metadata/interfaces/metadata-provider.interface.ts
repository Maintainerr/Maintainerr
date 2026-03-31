import {
  ExternalIdSearchResult,
  MetadataDetails,
  PersonDetails,
  ProviderIds,
} from './metadata.types';

export const MetadataProviders = Symbol('MetadataProviders');

export interface IMetadataProvider {
  readonly name: string;
  readonly idKey: string;

  isAvailable(): boolean;

  extractId(ids: ProviderIds): number | undefined;

  assignId(ids: ProviderIds, id: number): void;

  getDetails(
    id: number,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined>;

  getPosterUrl(
    id: number,
    type: 'movie' | 'tv',
    sizeHint?: string,
  ): Promise<string | undefined>;

  getBackdropUrl(
    id: number,
    type: 'movie' | 'tv',
    sizeHint?: string,
  ): Promise<string | undefined>;

  getPersonDetails(id: number): Promise<PersonDetails | undefined>;

  findByExternalId(
    externalId: string | number,
    type: string,
  ): Promise<ExternalIdSearchResult[] | undefined>;
}
