import {
  CollectionVisibilitySettings,
  CreateCollectionParams,
  LibraryQueryOptions,
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaLibrary,
  MediaPlaylist,
  MediaServerFeature,
  MediaServerStatus,
  MediaServerType,
  MediaUser,
  PagedResult,
  RecentlyAddedOptions,
  UpdateCollectionParams,
  WatchRecord,
} from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { EPlexDataType } from '../../plex-api/enums/plex-data-type-enum';
import { PlexApiService } from '../../plex-api/plex-api.service';
import { supportsFeature } from '../media-server.constants';
import { IMediaServerService } from '../media-server.interface';
import { PlexMapper } from './plex.mapper';

/**
 * Adapter that wraps PlexApiService to implement IMediaServerService.
 *
 * This adapter:
 * - Translates MediaItem/MediaLibrary types to/from Plex-specific types
 * - Provides feature detection for Plex-specific capabilities
 */
@Injectable()
export class PlexAdapterService implements IMediaServerService {
  private readonly logger = new Logger(PlexAdapterService.name);

  constructor(
    @Inject(forwardRef(() => PlexApiService))
    private readonly plexApi: PlexApiService,
  ) {}

  async initialize(): Promise<void> {
    await this.plexApi.initialize();
  }

  uninitialize(): void {
    this.plexApi.uninitialize();
  }

  isSetup(): boolean {
    return this.plexApi.isPlexSetup();
  }

  getServerType(): MediaServerType {
    return MediaServerType.PLEX;
  }

  supportsFeature(feature: MediaServerFeature): boolean {
    return supportsFeature(MediaServerType.PLEX, feature);
  }

  async getStatus(): Promise<MediaServerStatus | undefined> {
    const status = await this.plexApi.getStatus();
    if (!status) return undefined;
    return PlexMapper.toMediaServerStatus(status);
  }

  async getUsers(): Promise<MediaUser[]> {
    const users = await this.plexApi.getUsers();
    if (!users) return [];
    return users.map(PlexMapper.toMediaUser);
  }

  async getUser(id: string): Promise<MediaUser | undefined> {
    const user = await this.plexApi.getUser(parseInt(id, 10));
    if (!user) return undefined;
    return PlexMapper.toMediaUser(user);
  }

  async getLibraries(): Promise<MediaLibrary[]> {
    const libraries = await this.plexApi.getLibraries();
    if (!libraries) return [];
    return libraries.map(PlexMapper.toMediaLibrary);
  }

  async getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>> {
    // Check for migration issue: Jellyfin uses 32-char hex UUIDs, Plex uses numeric IDs
    const isJellyfinId = /^[a-f0-9]{32}$/i.test(libraryId);
    if (!libraryId || libraryId.trim() === '' || isJellyfinId) {
      this.logger.warn(
        `Library '${libraryId || '(empty)'}' appears to be from a different media server. Please update the library setting in your rules.`,
      );
      return { items: [], totalSize: 0, offset: 0, limit: 50 };
    }

    const plexType = options?.type
      ? PlexMapper.toPlexDataType(options.type)
      : undefined;

    const response = await this.plexApi.getLibraryContents(
      libraryId,
      {
        offset: options?.offset ?? 0,
        size: options?.limit ?? 50,
      },
      plexType,
    );

    const items = response?.items
      ? response.items.map(PlexMapper.toMediaItem)
      : [];

    return {
      items,
      totalSize: response?.totalSize ?? items.length,
      offset: options?.offset ?? 0,
      limit: options?.limit ?? 50,
    };
  }

  async getLibraryContentCount(
    libraryId: string,
    type?: MediaItemType,
  ): Promise<number> {
    const plexType = type ? PlexMapper.toPlexDataType(type) : undefined;
    const count = await this.plexApi.getLibraryContentCount(
      libraryId,
      plexType,
    );
    return count ?? 0;
  }

  async searchLibraryContents(
    libraryId: string,
    query: string,
    type?: MediaItemType,
  ): Promise<MediaItem[]> {
    const plexType = type ? PlexMapper.toPlexDataType(type) : undefined;
    const results = await this.plexApi.searchLibraryContents(
      libraryId,
      query,
      plexType,
    );

    if (!results) return [];

    return results.map(PlexMapper.toMediaItem);
  }

  async getMetadata(itemId: string): Promise<MediaItem | undefined> {
    const metadata = await this.plexApi.getMetadata(itemId);
    if (!metadata) return undefined;
    return PlexMapper.metadataToMediaItem(metadata);
  }

  async getChildrenMetadata(parentId: string): Promise<MediaItem[]> {
    const children = await this.plexApi.getChildrenMetadata(parentId);
    if (!children) return [];
    return children.map(PlexMapper.metadataToMediaItem);
  }

  async getRecentlyAdded(
    libraryId: string,
    options?: RecentlyAddedOptions,
  ): Promise<MediaItem[]> {
    // PlexApiService.getRecentlyAdded uses addedAt timestamp, not limit/type
    // We'll use the default (items added in last hour)
    const results = await this.plexApi.getRecentlyAdded(libraryId);

    if (!results) return [];

    // Apply limit if provided
    const limited = options?.limit ? results.slice(0, options.limit) : results;
    return limited.map(PlexMapper.toMediaItem);
  }

  async searchContent(query: string): Promise<MediaItem[]> {
    const results = await this.plexApi.searchContent(query);
    if (!results) return [];
    return results.map(PlexMapper.metadataToMediaItem);
  }

  async getWatchHistory(itemId: string): Promise<WatchRecord[]> {
    const history = await this.plexApi.getWatchHistory(itemId);
    if (!history) return [];
    return history.map(PlexMapper.toWatchRecord);
  }

  async getItemSeenBy(itemId: string): Promise<string[]> {
    const history = await this.getWatchHistory(itemId);
    // Extract unique user IDs
    const userIds = new Set(history.map((record) => record.userId));
    return Array.from(userIds);
  }

  async getCollections(libraryId: string): Promise<MediaCollection[]> {
    const collections = await this.plexApi.getCollections(libraryId);
    if (!collections) return [];
    return collections.map(PlexMapper.toMediaCollection);
  }

  async getCollection(
    collectionId: string,
  ): Promise<MediaCollection | undefined> {
    const collection = await this.plexApi.getCollection(collectionId);
    if (!collection) return undefined;
    return PlexMapper.toMediaCollection(collection);
  }

  async createCollection(
    params: CreateCollectionParams,
  ): Promise<MediaCollection> {
    const plexType = PlexMapper.toPlexDataType(params.type);
    const result = await this.plexApi.createCollection({
      libraryId: params.libraryId,
      type: plexType,
      title: params.title,
      summary: params.summary,
      sortTitle: params.sortTitle,
    });

    if (!result) {
      throw new Error('Failed to create collection');
    }

    return PlexMapper.toMediaCollection(result);
  }

  async deleteCollection(collectionId: string): Promise<void> {
    await this.plexApi.deleteCollection(collectionId);
  }

  async getCollectionChildren(collectionId: string): Promise<MediaItem[]> {
    const children = await this.plexApi.getCollectionChildren(collectionId);
    if (!children) return [];
    return children.map(PlexMapper.toMediaItem);
  }

  async addToCollection(collectionId: string, itemId: string): Promise<void> {
    await this.plexApi.addChildToCollection(collectionId, itemId);
  }

  async removeFromCollection(
    collectionId: string,
    itemId: string,
  ): Promise<void> {
    await this.plexApi.deleteChildFromCollection(collectionId, itemId);
  }

  // PLEX-SPECIFIC: COLLECTION UPDATE & VISIBILITY

  async updateCollection(
    params: UpdateCollectionParams,
  ): Promise<MediaCollection> {
    const result = await this.plexApi.updateCollection({
      libraryId: params.libraryId,
      collectionId: params.collectionId,
      type: EPlexDataType.MOVIES, // Type is required but not used for updates
      title: params.title,
      summary: params.summary,
      sortTitle: params.sortTitle,
    });

    return PlexMapper.toMediaCollection(result);
  }

  async updateCollectionVisibility(
    settings: CollectionVisibilitySettings,
  ): Promise<void> {
    await this.plexApi.UpdateCollectionSettings({
      libraryId: settings.libraryId,
      collectionId: settings.collectionId,
      recommended: settings.recommended ?? false,
      ownHome: settings.ownHome ?? false,
      sharedHome: settings.sharedHome ?? false,
    });
  }

  async getWatchlistForUser(userId: string): Promise<string[]> {
    // PlexApiService.getWatchlistIdsForUser requires both userId and username
    // but returns PlexCommunityWatchList[] with id, key, title, type
    // For now, we can't call this without username - log for debugging
    this.logger.debug(
      `getWatchlistForUser called for user ${userId}, but this method requires username which is not available`,
    );
    return [];
  }

  async getPlaylists(libraryId: string): Promise<MediaPlaylist[]> {
    const playlists = await this.plexApi.getPlaylists(libraryId);
    if (!playlists) return [];
    return playlists.map(PlexMapper.toMediaPlaylist);
  }

  async deleteFromDisk(itemId: string): Promise<void> {
    await this.plexApi.deleteMediaFromDisk(itemId);
  }

  async getAllIdsForContextAction(
    collectionType: MediaItemType | undefined,
    context: { type: MediaItemType; id: string },
    mediaId: string,
  ): Promise<string[]> {
    const result = await this.plexApi.getAllIdsForContextAction(
      collectionType ? PlexMapper.toPlexDataType(collectionType) : undefined,
      { type: PlexMapper.toPlexDataType(context.type), id: Number(context.id) },
      { plexId: Number(mediaId) },
    );
    return result.map((r) => String(r.plexId));
  }

  resetMetadataCache(itemId?: string): void {
    // PlexApiService uses cacheManager internally
    // This is a simplified reset - could be enhanced to target specific items
    if (itemId) {
      // For now, we can't reset specific items in the current Plex cache implementation
      // Would need to enhance PlexApiService to support this
    }
    // Full cache reset would need access to cacheManager
  }
}
