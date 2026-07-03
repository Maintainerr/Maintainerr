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

export interface MediaWatchState {
  viewCount: number;
  isWatched: boolean;
}

/**
 * Core interface for media server implementations.
 * Both Plex and Jellyfin adapters must implement this interface.
 *
 * Design notes:
 * - All async methods should handle errors gracefully and log appropriately
 * - Cache management is implementation-specific but exposed via resetMetadataCache
 *
 * Error handling contract:
 * - Read operations (get*, search*): Return empty array/undefined on failure, log the error
 * - Write operations (create*, update*, delete*, add*, remove*): Throw Error with descriptive message
 * - This allows callers to safely iterate over read results while catching write failures
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
   * Get per-library size on disk, in bytes, via a cheap native endpoint.
   * Returns a map of library id → bytes for libraries where the server
   * exposes that data. Libraries missing from the map have no size info.
   * Implementations that don't support storage stats return an empty map.
   */
  getLibrariesStorage(): Promise<Map<string, number>>;

  /**
   * Compute per-library size on disk by enumerating items. Potentially slow
   * - meant to be called on demand. Returns a map of library id → bytes.
   * Libraries missing from the map could not be sized.
   */
  computeLibraryStorageSizes(): Promise<Map<string, number>>;

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
   * Confirm an item is still present on the media server.
   *
   * Returns `false` only when the server explicitly reports the item as
   * absent (404 / empty result); any other failure (auth, network, 5xx)
   * throws so callers don't treat "couldn't check" as "gone" and drop state
   * on a transient blip. Unlike `getMetadata`, which returns `undefined` for
   * both absent and failed reads, this is safe for cleanup decisions.
   */
  itemExists(itemId: string): Promise<boolean>;

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
   * Prefetch watch history for all library items in a single bulk request,
   * caching the result so that subsequent per-item getWatchHistory /
   * getWatchState calls can be served from memory instead of making individual
   * HTTP requests.
   *
   * Gated by MediaServerFeature.CENTRAL_WATCH_HISTORY (a centrally queryable
   * history endpoint). Throws if not supported - callers must check
   * supportsFeature() first; when unsupported, evaluation uses per-item queries.
   */
  prefetchWatchHistory(abortSignal?: AbortSignal): Promise<void>;

  /**
   * Get watch history for a specific item.
   * Implementation varies by server:
   * - Plex: Single API call to history endpoint
   * - Jellyfin: Requires iterating over users
   */
  getWatchHistory(itemId: string): Promise<WatchRecord[]>;

  /**
   * Get aggregate watch state for a specific item.
   *
   * @param nativeViewCount - Optional native view count from the media item
   *   metadata. Used as a fallback signal for `isWatched` when watch history
   *   has been purged or the item was marked watched without a play event.
   *   Note: on Plex this value is per-user (admin token), so it is only used
   *   for the boolean `isWatched`, not for the numeric `viewCount`.
   */
  getWatchState(
    itemId: string,
    nativeViewCount?: number,
    itemTitle?: string,
    itemType?: MediaItemType,
  ): Promise<MediaWatchState>;

  /**
   * Get list of user IDs who have watched/seen a specific item.
   * Convenience method built on top of getWatchHistory.
   */
  getItemSeenBy(itemId: string): Promise<string[]>;

  /**
   * Get the set of media server item IDs that are currently being played in
   * an active streaming session. The collection worker uses this to defer
   * handling of in-use media to the next run (deletion is the case that
   * matters; the occasional non-destructive action is deferred too rather
   * than scoped - a deliberate simplification).
   *
   * For hierarchical media the set includes every level a collection might
   * track: a playing episode contributes its own id plus its season and show
   * ids, so a collection holding the episode, season, or whole show is
   * protected.
   *
   * Best-effort: returns an empty set when nothing is playing and, after the
   * HTTP client's own retries, when the lookup could not be completed - so a
   * session outage degrades to the pre-existing behaviour (handle as usual)
   * rather than blocking the run. The worker reads this once at the start of a
   * run, so media that starts playing mid-run isn't protected until the next
   * run.
   */
  getActiveSessions(): Promise<Set<string>>;

  /**
   * Get all collections in a library.
   */
  getCollections(libraryId: string): Promise<MediaCollection[]>;

  /**
   * Get a specific collection by ID.
   */
  getCollection(
    collectionId: string,
    throwOnError?: boolean,
  ): Promise<MediaCollection | undefined>;

  /**
   * Create a new collection.
   * @throws Error if creation fails
   */
  createCollection(params: CreateCollectionParams): Promise<MediaCollection>;

  /**
   * Delete a collection.
   * @throws Error if deletion fails
   */
  deleteCollection(collectionId: string): Promise<void>;

  /**
   * Clean up a collection when a rule group's settings change.
   * Removes items belonging to the specified library from the collection.
   * Deletes the collection entirely if it becomes empty and is not manual.
   *
   * @param collectionId - The media server collection ID
   * @param libraryId - The library whose items should be removed
   * @param isManualCollection - Whether this is a manual (user-named) collection
   */
  cleanupCollectionForLibrary(
    collectionId: string,
    libraryId: string,
    isManualCollection: boolean,
  ): Promise<void>;

  /**
   * Get items in a collection.
   * Returns empty array if collection not found or on error.
   */
  getCollectionChildren(collectionId: string): Promise<MediaItem[]>;

  /**
   * Add an item to a collection.
   * @throws Error if operation fails
   */
  addToCollection(collectionId: string, itemId: string): Promise<void>;

  /**
   * Add multiple items to a collection in a single operation.
   * Returns the itemIds that failed to be added.
   */
  addBatchToCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]>;

  /**
   * Remove an item from a collection.
   * @throws Error if operation fails
   */
  removeFromCollection(collectionId: string, itemId: string): Promise<void>;

  /**
   * Remove multiple items from a collection in a single operation.
   * Returns the itemIds that failed to be removed.
   */
  removeBatchFromCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]>;

  /**
   * Update a collection's metadata (title, summary, etc.)
   * @throws Error if not supported by media server or update fails
   */
  updateCollection(params: UpdateCollectionParams): Promise<MediaCollection>;

  /**
   * Update collection visibility/hub settings.
   * @throws Error if not supported by media server (Plex-only feature) or update fails
   */
  updateCollectionVisibility(
    settings: CollectionVisibilitySettings,
  ): Promise<void>;

  /**
   * Push an ordered list of item IDs onto the collection's display order.
   * Implementations must switch the collection into custom-sort mode
   * (or no-op) before applying. Gated by MediaServerFeature.COLLECTION_SORT.
   * Throws if not supported. Caller is responsible for filtering out
   * smart collections (Plex rejects move on smart).
   *
   * Implementations should short-circuit when the current child order
   * already matches `orderedItemIds`, and continue through the full list
   * if individual moves fail (logging a summary at the end).
   */
  reorderCollectionItems(
    collectionId: string,
    orderedItemIds: string[],
  ): Promise<void>;

  /**
   * Set the primary poster image on a collection on the media server.
   *
   * Maintainerr is one writer among several (Kometa, Posterizarr, manual
   * uploads). This is a single write - last writer wins. Unlike per-item
   * overlays (which re-apply on cron because they carry day-counter state),
   * collection posters carry no per-cycle state, so callers should write
   * only when the source bytes change (user upload, collection re-create);
   * polling on a schedule would just fight other writers for no benefit.
   *
   * Gated by MediaServerFeature.COLLECTION_POSTER. Throws on upload failure.
   */
  setCollectionImage(
    collectionId: string,
    buffer: Buffer,
    contentType: string,
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

  /**
   * Ask the media server to re-fetch metadata for a specific item from its
   * own configured agents. This is a best-effort, fire-and-forget operation
   * on the server side - the call returns quickly while the server works async.
   */
  refreshItemMetadata(itemId: string): Promise<void>;
}
