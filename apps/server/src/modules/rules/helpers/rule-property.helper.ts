import { type MediaItemType, type WatchRecord } from '@maintainerr/contracts';
import { type RuleGroupDto } from '../dtos/ruleGroup.dto';
import { buildCollectionExcludeNames } from './collection-exclude.helper';

type RuleUserId = string | number;

export function isValidDate(date?: Date): boolean {
  return Number.isFinite(date?.getTime());
}

// A completed watch without a date cannot be placed against the cutoff, so it
// does not count; a malformed date is a read failure and propagates.
export function isWatchedAfter(record: WatchRecord, cutoff: Date): boolean {
  if (record.watchedAt === undefined) return false;
  if (!isValidDate(record.watchedAt)) {
    throw new Error('Watch history has an invalid watchedAt timestamp');
  }
  return record.watchedAt > cutoff;
}

export function normalizeRulePropertyName(name: string): string {
  return name.toLowerCase().trim();
}

export function trimRulePropertyNames(names: readonly string[]): string[] {
  return names.map((name) => name.trim());
}

export function uniqueTrimmedRulePropertyNames(
  names: readonly string[],
): string[] {
  // Behaviour-preserving extraction of the Plex smart-collection name logic
  // from #1630: de-duplicate on the RAW value first - collapsing a collection
  // that appears at several parent levels or as a smart collection - and trim
  // only afterwards. Because dedupe runs before trimming, names that differ
  // only in surrounding whitespace (or case) remain separate list entries.
  // That distinction is user-visible: these feed COUNT_* comparators on the
  // *_including_smart TEXT_LIST rules, so list length must match what shipped.
  // Do NOT switch this to trim-then-dedupe.
  return Array.from(new Set(names), (name) => name.trim());
}

export function filterRuleCollectionNames(
  collectionNames: readonly string[],
  ruleGroup?: RuleGroupDto,
): string[] {
  const excludedCollectionNames = new Set(
    buildCollectionExcludeNames(ruleGroup),
  );

  return trimRulePropertyNames(collectionNames).filter(
    (name) => !excludedCollectionNames.has(normalizeRulePropertyName(name)),
  );
}

export function countRuleCollectionNames(
  collectionNames: readonly string[],
  ruleGroup?: RuleGroupDto,
): number {
  return filterRuleCollectionNames(collectionNames, ruleGroup).length;
}

export function mapRuleUserIdsToNames<TUser, TId extends RuleUserId>(
  userIds: readonly TId[],
  users: readonly TUser[],
  getUserId: (user: TUser) => TId,
  getUserName: (user: TUser) => string,
): string[] {
  const userNamesById = new Map(
    users.map((user) => [getUserId(user), getUserName(user)]),
  );

  return userIds.map((id) => {
    const name = userNamesById.get(id);
    return name?.trim() ? name : String(id);
  });
}

export function mapMatchingRuleUsersToNames<TUser, TId extends RuleUserId>(
  userIds: readonly TId[],
  users: readonly TUser[],
  getUserId: (user: TUser) => TId,
  getUserName: (user: TUser) => string,
): string[] {
  const matchingUserIds = new Set(userIds);

  return users
    .filter((user) => matchingUserIds.has(getUserId(user)))
    .map((user) => getUserName(user));
}

export async function getParentBackedRuleItem<TItem>(
  mediaType: MediaItemType | string,
  item: TItem,
  getParent: () => Promise<TItem | undefined>,
  getGrandparent: () => Promise<TItem | undefined>,
): Promise<TItem> {
  if (mediaType === 'episode') {
    return (await getGrandparent()) ?? item;
  }

  if (mediaType === 'season') {
    return (await getParent()) ?? item;
  }

  return item;
}

export function definedUniqueValues<TValue>(
  values: readonly (TValue | null | undefined)[],
): TValue[] {
  return Array.from(
    new Set(values.filter((value): value is TValue => value != null)),
  );
}
