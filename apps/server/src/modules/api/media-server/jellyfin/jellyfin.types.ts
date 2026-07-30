/**
 * Jellyfin-specific type extensions and helpers.
 * These types supplement the @jellyfin/sdk types with Maintainerr-specific needs.
 */

import type { WatchRecord } from '@maintainerr/contracts';
import type {
  BaseItemDto,
  UserDto,
  UserItemDataDto,
} from '@jellyfin/sdk/lib/generated-client/models';

/**
 * Library-wide watch state captured once per rule run by
 * JellyfinAdapterService.prefetchWatchHistory.
 */
export interface JellyfinWatchSnapshot {
  /**
   * Item id (movie, episode, series or season) -> completed-watch records. The
   * sweep is unfiltered, so an entry exists for every item it saw: a
   * present-but-empty array is a confirmed "never watched", while an absent key
   * means "not swept" and must fall back to a live read.
   */
  watchHistory: Map<string, WatchRecord[]>;
  /** Series and season id -> the episode ids beneath it, from the same sweep. */
  descendants: Map<string, string[]>;
  /** Item id -> ids of the users who favourited it. */
  favoritedBy: Map<string, string[]>;
  /** Item id -> PlayCount summed across users (includes partial plays). */
  playCount: Map<string, number>;
  /**
   * PlayedPercentage threshold the records were built with. isCompletedWatch
   * depends on it, so a snapshot built under a different one is not reused.
   */
  playedCompletionThreshold: number | undefined;
}

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
