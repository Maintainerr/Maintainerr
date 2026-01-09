/**
 * Jellyfin-specific type extensions and helpers.
 * These types supplement the @jellyfin/sdk types with Maintainerr-specific needs.
 */

import type {
  BaseItemDto,
  UserDto,
  UserItemDataDto,
} from '@jellyfin/sdk/lib/generated-client/models';

export type JellyfinMediaItem = BaseItemDto;

export interface JellyfinUserItemData extends UserItemDataDto {
  userId: string;
  userName?: string;
}

export type JellyfinUser = UserDto;

export interface JellyfinLibraryFolder {
  Id: string;
  Name: string;
  CollectionType?: string;
  Path?: string;
}

export interface JellyfinCollectionCreatedResult {
  Id: string;
}

export interface JellyfinWatchedCacheEntry {
  [itemId: string]: string[];
}

export interface BuildWatchedCacheOptions {
  force?: boolean;
  userIds?: string[];
}

export function hasProviderIds(item: BaseItemDto): item is BaseItemDto & {
  ProviderIds: NonNullable<BaseItemDto['ProviderIds']>;
} {
  return item.ProviderIds !== undefined && item.ProviderIds !== null;
}

export function hasUserData(
  item: BaseItemDto,
): item is BaseItemDto & { UserData: NonNullable<BaseItemDto['UserData']> } {
  return item.UserData !== undefined && item.UserData !== null;
}

export function hasMediaSources(item: BaseItemDto): item is BaseItemDto & {
  MediaSources: NonNullable<BaseItemDto['MediaSources']>;
} {
  return item.MediaSources !== undefined && item.MediaSources !== null;
}
