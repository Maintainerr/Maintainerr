import {
  CollectionVisibilitySettings,
  CreateCollectionParams,
  MediaServerFeature,
  MediaServerType,
  LibraryQueryOptions,
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaLibrary,
  MediaPlaylist,
  MediaServerStatus,
  MediaUser,
  PagedResult,
  RecentlyAddedOptions,
  UpdateCollectionParams,
  WatchRecord,
} from '@maintainerr/contracts';

/**
 * Core interface for media server implementations.
 * Both Plex and Jellyfin adapters must implement this interface.
 *
 * Design notes:
 * - Methods that differ significantly between servers have optional variants
 * - All async methods should handle errors gracefully and log appropriately
 * - Cache management is implementation-specific but exposed via resetMetadataCache
 */
export interface IMediaServerService {
  /**
   * Initialize the connection to the media server.
   * Should validate connection and cache server info.
   */
  initialize(): Promise<void>;

  /**
   * Cleanup resources and connections.
   * Should clear caches and reset state.
   */
  uninitialize(): void;

  /**
   * Check if the service is properly initialized and ready for use.
   */
  isSetup(): boolean;

  /**
   * Get the type of media server this service connects to.
   */
  getServerType(): MediaServerType;

  /**
   * Check if a specific feature is supported by this media server.
   * Used to conditionally enable/disable functionality.
   */
  supportsFeature(feature: MediaServerFeature): boolean;

  /**
   * Get server status and version information.
   * Returns undefined if server is unreachable.
   */
  getStatus(): Promise<MediaServerStatus | undefined>;

  /**
   * Get all users with access to the media server.
   */
  getUsers(): Promise<MediaUser[]>;

  /**
   * Get a specific user by ID.
   */
  getUser(id: string): Promise<MediaUser | undefined>;

  /**
   * Get all libraries available on the media server.
   */
  getLibraries(): Promise<MediaLibrary[]>;

  /**
   * Get contents of a specific library with optional pagination and filtering.
   */
  getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>>;

  /**
   * Get total count of items in a library, optionally filtered by type.
   */
  getLibraryContentCount(
    libraryId: string,
    type?: MediaItemType,
  ): Promise<number>;

  /**
   * Search within a specific library.
   */
  searchLibraryContents(
    libraryId: string,
    query: string,
    type?: MediaItemType,
  ): Promise<MediaItem[]>;

  /**
   * Get detailed metadata for a specific item.
   */
  getMetadata(itemId: string): Promise<MediaItem | undefined>;

  /**
   * Get child items (seasons for shows, episodes for seasons).
   */
  getChildrenMetadata(parentId: string): Promise<MediaItem[]>;

  /**
   * Get recently added items from a library.
   */
  getRecentlyAdded(
    libraryId: string,
    options?: RecentlyAddedOptions,
  ): Promise<MediaItem[]>;

  /**
   * Search across all content on the server.
   */
  searchContent(query: string): Promise<MediaItem[]>;

  /**
   * Get watch history for a specific item.
   * Implementation varies by server:
   * - Plex: Single API call to history endpoint
   * - Jellyfin: Requires iterating over users
   */
  getWatchHistory(itemId: string): Promise<WatchRecord[]>;

  /**
   * Get list of user IDs who have watched/seen a specific item.
   * Convenience method built on top of getWatchHistory.
   */
  getItemSeenBy(itemId: string): Promise<string[]>;

  /**
   * Get all collections in a library.
   */
  getCollections(libraryId: string): Promise<MediaCollection[]>;

  /**
   * Get a specific collection by ID.
   */
  getCollection(collectionId: string): Promise<MediaCollection | undefined>;

  /**
   * Create a new collection.
   */
  createCollection(params: CreateCollectionParams): Promise<MediaCollection>;

  /**
   * Delete a collection.
   */
  deleteCollection(collectionId: string): Promise<void>;

  /**
   * Get items in a collection.
   */
  getCollectionChildren(collectionId: string): Promise<MediaItem[]>;

  /**
   * Add an item to a collection.
   */
  addToCollection(collectionId: string, itemId: string): Promise<void>;

  /**
   * Remove an item from a collection.
   */
  removeFromCollection(collectionId: string, itemId: string): Promise<void>;

  /**
   * Update a collection's metadata (title, summary, etc.)
   * @throws Error if not supported by media server
   */
  updateCollection(params: UpdateCollectionParams): Promise<MediaCollection>;

  /**
   * Update collection visibility/hub settings.
   * @throws Error if not supported by media server (Plex-only feature)
   */
  updateCollectionVisibility(
    settings: CollectionVisibilitySettings,
  ): Promise<void>;

  /**
   * Get watchlist items for a user.
   * Only available on Plex (requires Plex.tv API).
   */
  getWatchlistForUser?(userId: string): Promise<string[]>;

  /**
   * Get playlists in a library.
   */
  getPlaylists(libraryId: string): Promise<MediaPlaylist[]>;

  /**
   * Delete an item from disk.
   * This is a destructive operation!
   */
  deleteFromDisk(itemId: string): Promise<void>;

  /**
   * Get all media server IDs for a context action (add/remove from collection).
   * Handles show→season→episode traversal based on collection type.
   *
   * @param collectionType - The type of the target collection (determines what IDs to return)
   * @param context - The context item (what level the user is acting on)
   * @param mediaId - The media item ID
   * @returns Array of media server IDs to add/remove
   */
  getAllIdsForContextAction(
    collectionType: MediaItemType | undefined,
    context: { type: MediaItemType; id: string },
    mediaId: string,
  ): Promise<string[]>;

  /**
   * Reset metadata cache.
   * @param itemId - If provided, only reset cache for this item. Otherwise reset all.
   */
  resetMetadataCache(itemId?: string): void;
}
