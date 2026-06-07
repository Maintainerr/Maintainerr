import {
  ArrDiskspaceResource,
  MediaItem,
  MediaItemType,
  MediaItemWithParent,
  MediaLibrary,
} from '@maintainerr/contracts';
import { PlexCollection } from '../../src/modules/api/plex-api/interfaces/collection.interface';
import {
  PlexLibrary,
  PlexLibraryItem,
  PlexSeenBy,
  PlexUserAccount,
} from '../../src/modules/api/plex-api/interfaces/library.interfaces';
import { PlexMetadata } from '../../src/modules/api/plex-api/interfaces/media.interface';
import {
  RadarrMovie,
  RadarrMovieFile,
  RadarrQuality,
} from '../../src/modules/api/servarr-api/interfaces/radarr.interface';
import {
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrSeries,
} from '../../src/modules/api/servarr-api/interfaces/sonarr.interface';
import { Collection } from '../../src/modules/collections/entities/collection.entities';
import {
  CollectionMedia,
  CollectionMediaWithMetadata,
} from '../../src/modules/collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../../src/modules/logging/logs.service';
import { MetadataLookupPolicy } from '../../src/modules/metadata/interfaces/metadata-lookup-policy.interface';
import { IMetadataProvider } from '../../src/modules/metadata/interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  ResolvedMediaIds,
} from '../../src/modules/metadata/interfaces/metadata.types';
import { RuleDto } from '../../src/modules/rules/dtos/rule.dto';
import { RulesDto } from '../../src/modules/rules/dtos/rules.dto';
export declare const createCollection: (
  properties?: Partial<Collection>,
) => Collection;
export declare const createCollectionMedia: (
  collectionOrType?: Collection | MediaItemType,
  properties?: Partial<CollectionMedia>,
) => CollectionMedia;
type CollectionMediaWithMetadataOptional = Omit<
  CollectionMediaWithMetadata,
  'mediaData'
> & {
  mediaData: Partial<Omit<MediaItemWithParent, 'type'>>;
};
export declare const createCollectionMediaWithMetadata: (
  collectionOrType?: Collection | MediaItemType,
  properties?: Partial<CollectionMediaWithMetadataOptional>,
) => CollectionMediaWithMetadata;
export declare const createMediaItem: (
  properties?: Partial<MediaItem>,
) => MediaItemWithParent;
export declare const createPlexMetadata: (
  properties?: Partial<PlexMetadata>,
) => PlexMetadata;
export declare const createPlexLibrary: (
  properties?: Partial<PlexLibrary>,
) => PlexLibrary;
export declare const createPlexUserAccount: (
  properties?: Partial<PlexUserAccount>,
) => PlexUserAccount;
export declare const createPlexSeenBy: (
  properties?: Partial<PlexSeenBy>,
) => PlexSeenBy;
export declare const createPlexCollection: (
  properties?: Partial<PlexCollection>,
) => PlexCollection;
export declare const createMediaLibrary: (
  properties?: Partial<MediaLibrary>,
) => MediaLibrary;
export declare const createMediaLibraries: (
  properties?: Partial<MediaLibrary>,
) => MediaLibrary[];
export declare const createPlexLibraryItem: (
  type?: PlexMetadata['type'],
  properties?: Partial<PlexLibraryItem>,
) => PlexLibraryItem;
export declare const createRadarrMovie: (
  properties?: Partial<RadarrMovie>,
) => RadarrMovie;
export declare const createRadarrMovieFile: (
  properties?: Partial<RadarrMovieFile>,
) => RadarrMovieFile;
export declare const createRadarrQuality: (
  properties?: Partial<RadarrQuality>,
) => RadarrQuality;
export declare const createSonarrSeries: (
  properties?: Partial<SonarrSeries>,
) => SonarrSeries;
export declare const createSonarrEpisode: (
  properties?: Partial<SonarrEpisode>,
) => SonarrEpisode;
export declare const createSonarrEpisodeFile: (
  properties?: Partial<SonarrEpisodeFile>,
) => SonarrEpisodeFile;
export declare const createRulesDto: (
  properties?: Partial<RulesDto>,
) => RulesDto;
export declare const createArrDiskspaceResource: (
  properties?: Partial<ArrDiskspaceResource>,
) => ArrDiskspaceResource;
export declare const createRuleDto: (properties?: Partial<RuleDto>) => RuleDto;
export declare const createMockLogger: () => jest.Mocked<MaintainerrLogger>;
type MetadataDetailsFixture = Partial<Omit<MetadataDetails, 'externalIds'>> & {
  externalIds?: Partial<ResolvedMediaIds> & Pick<ResolvedMediaIds, 'type'>;
};
export interface MetadataProviderMockConfig {
  name: string;
  idKey: string;
  isAvailable?: boolean;
  details?: MetadataDetailsFixture;
  detailsId?: number;
  posterUrl?: string;
  backdropUrl?: string;
  findByExternalId?: (
    externalId: string | number,
    type: string,
  ) => Promise<ExternalIdSearchResult[] | undefined>;
}
export interface MetadataLookupServiceTestCase {
  title: string;
  service: string;
  lookupPolicy: MetadataLookupPolicy;
  libraryItem: Partial<MediaItem>;
  providerMocks: MetadataProviderMockConfig[];
  expectedCandidates: Array<{
    providerKey: string;
    id: number;
  }>;
}
export declare const createMetadataDetails: (
  properties?: MetadataDetailsFixture,
) => MetadataDetails;
export declare const createMetadataProviderMock: ({
  name,
  idKey,
  isAvailable,
  details,
  detailsId,
  posterUrl,
  backdropUrl,
  findByExternalId,
}: MetadataProviderMockConfig) => jest.Mocked<IMetadataProvider>;
export declare const metadataLookupServiceTestCases: MetadataLookupServiceTestCase[];
export {};
//# sourceMappingURL=data.d.ts.map
