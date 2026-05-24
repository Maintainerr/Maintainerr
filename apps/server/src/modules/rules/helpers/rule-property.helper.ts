import { type MediaItemType } from '@maintainerr/contracts';
import { type RulesDto } from '../dtos/rules.dto';
import { buildCollectionExcludeNames } from './collection-exclude.helper';

type RuleUserId = string | number;

export function normalizeRulePropertyName(name: string): string {
  return name.toLowerCase().trim();
}

export function trimRulePropertyNames(names: readonly string[]): string[] {
  return names.map((name) => name.trim());
}

export function uniqueTrimmedRulePropertyNames(
  names: readonly string[],
): string[] {
  const seenNames = new Set<string>();
  const uniqueNames: string[] = [];

  for (const name of names) {
    const trimmedName = name.trim();
    const normalizedName = normalizeRulePropertyName(trimmedName);

    if (!seenNames.has(normalizedName)) {
      seenNames.add(normalizedName);
      uniqueNames.push(trimmedName);
    }
  }

  return uniqueNames;
}

export function filterRuleCollectionNames(
  collectionNames: readonly string[],
  ruleGroup?: RulesDto,
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
  ruleGroup?: RulesDto,
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
