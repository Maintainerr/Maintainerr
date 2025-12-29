/**
 * Jellyfin-specific type extensions and helpers.
 * These types supplement the @jellyfin/sdk types with Maintainerr-specific needs.
 */

import type {
  BaseItemDto,
  UserDto,
  UserItemDataDto,
} from '@jellyfin/sdk/lib/generated-client/models';

/**
 * Extended BaseItemDto with additional computed fields used by Maintainerr
 */
export interface JellyfinMediaItem extends BaseItemDto {
  // Original properties are inherited
}

/**
 * User item data with additional context
 */
export interface JellyfinUserItemData extends UserItemDataDto {
  userId: string;
  userName?: string;
}

/**
 * Jellyfin user representation with Maintainerr context
 */
export interface JellyfinUser extends UserDto {
  // Original properties are inherited
}

/**
 * Library folder response structure
 */
export interface JellyfinLibraryFolder {
  Id: string;
  Name: string;
  CollectionType?: string;
  Path?: string;
}

/**
 * Collection creation response
 */
export interface JellyfinCollectionCreatedResult {
  Id: string;
}

/**
 * Watched cache entry structure for library-wide watch tracking
 */
export interface JellyfinWatchedCacheEntry {
  /** Map of itemId to array of userIds who have watched */
  [itemId: string]: string[];
}

/**
 * Options for building watched cache
 */
export interface BuildWatchedCacheOptions {
  /** Force rebuild even if cache exists */
  force?: boolean;
  /** Include only specific users */
  userIds?: string[];
}

/**
 * Type guard to check if an item has provider IDs
 */
export function hasProviderIds(
  item: BaseItemDto,
): item is BaseItemDto & { ProviderIds: NonNullable<BaseItemDto['ProviderIds']> } {
  return item.ProviderIds !== undefined && item.ProviderIds !== null;
}

/**
 * Type guard to check if an item has user data
 */
export function hasUserData(
  item: BaseItemDto,
): item is BaseItemDto & { UserData: NonNullable<BaseItemDto['UserData']> } {
  return item.UserData !== undefined && item.UserData !== null;
}

/**
 * Type guard to check if an item has media sources
 */
export function hasMediaSources(
  item: BaseItemDto,
): item is BaseItemDto & { MediaSources: NonNullable<BaseItemDto['MediaSources']> } {
  return item.MediaSources !== undefined && item.MediaSources !== null;
}
