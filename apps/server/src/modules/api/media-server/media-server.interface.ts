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
   * An empty page means the server confirmed there are no (more) items -
   * never "the read failed".
   *
   * @throws Error on any failure to read the page (connection, 4xx/5xx).
   * Like getCollectionChildren: a fabricated empty page would read as
   * end-of-library and let rule evaluation truncate silently, mass-removing
   * the unevaluated tail from collections.
   */
  getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>>;

  /**
   * Get total count of items in a library, optionally filtered by type.
   *
   * @throws Error on a failed read - a fabricated 0 masks the failure from
   * callers that gate work on the count.
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
  /**
   * @param throwOnError - by default a failed read answers with an empty list,
   * which reads as "no children" downstream. Callers that must not mistake the
   * two pass true.
   */
  getChildrenMetadata(
    parentId: string,
    childType?: MediaItemType,
    throwOnError?: boolean,
  ): Promise<MediaItem[]>;

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
   * Prefetch watch history in bulk, caching the result so that subsequent
   * per-item getWatchHistory / getWatchState calls can be served from memory
   * instead of making individual HTTP requests.
   *
   * @param libraryId - The library about to be evaluated. Sweeps are scoped to
   *   it and cached per library: a rule group only ever evaluates its own
   *   library, and an unscoped sweep pays for every other one on the server.
   *
   * Gated by MediaServerFeature.CENTRAL_WATCH_HISTORY (watch history is
   * fetchable in bulk, whether from one central endpoint or one sweep per
   * user). Throws if not supported - callers must check supportsFeature()
   * first; when unsupported, evaluation uses per-item queries.
   *
   * Best-effort: implementations swallow their own failures and leave no
   * cached result, so getWatchHistory falls back to live per-item reads. A
   * failed prefetch must never surface as "nothing was watched".
   */
  prefetchWatchHistory(options: {
    libraryId: string;
    abortSignal?: AbortSignal;
  }): Promise<void>;

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
   * @param nativeViewCount - Optional view count carried by the item's own
   *   metadata, for the servers that record a watched state without writing a
   *   history row (marking something played by hand, a scrobble from an
   *   external tracker). It is an extra signal, never a replacement: where a
   *   server reports it per account rather than per server, it can raise the
   *   aggregate but must never lower what history already established.
   */
  getWatchState(
    itemId: string,
    nativeViewCount?: number,
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
   * Get all collections in a library. An empty array means the server confirmed
   * the library holds no collections - never "the lookup failed".
   *
   * @throws Error on any failure to enumerate, including an uninitialized
   * client. A failed listing read as "no collection with that title" is what
   * makes the link lookup create a duplicate beside the real one (#3344).
   *
   * @param useCache - Cached by default for the per-item rule reads. Callers
   * deciding whether a collection EXISTS must pass false; a stale listing
   * reports one created since the last read as missing.
   */
  getCollections(
    libraryId: string,
    useCache?: boolean,
  ): Promise<MediaCollection[]>;

  /**
   * Get a specific collection by ID. Undefined means the server confirmed the
   * collection is gone (404) - never "the lookup failed".
   *
   * @param throwOnError - When true a failed lookup throws, so callers that
   * unlink on "missing" can tell a deleted collection from an unreachable
   * server. Uncertainty must never unlink.
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
   * Get items in a collection. An empty array means the server confirmed
   * the collection has no children - never "the lookup failed".
   *
   * @throws Error on any failure to enumerate (connection, 4xx/5xx).
   * Callers must treat a throw as "children unknown" and skip membership
   * reconciliation instead of acting on an empty list; like itemExists,
   * uncertainty must never add or remove anything.
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
   * @param itemId - If provided, invalidate at least this item's cached
   * metadata; implementations may drop more (Jellyfin also clears its
   * children and watch namespaces, Emby flushes everything). Otherwise
   * reset all.
   */
  resetMetadataCache(itemId?: string): void;

  /**
   * Ask the media server to re-fetch metadata for a specific item from its
   * own configured agents. This is a best-effort, fire-and-forget operation
   * on the server side - the call returns quickly while the server works async.
   */
  refreshItemMetadata(itemId: string): Promise<void>;
}
