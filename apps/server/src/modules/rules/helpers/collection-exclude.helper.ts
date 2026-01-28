import { RulesDto } from '../dtos/rules.dto';

/**
 * Builds a list of collection names to exclude when counting collections for an item.
 *
 * This is used to prevent a rule from counting its own collection when evaluating
 * `collections == 0` or similar conditions. Without this, items would oscillate
 * in and out of collections: they pass the rule (0 collections), get added,
 * then fail (1 collection), get removed, then pass again, etc.
 *
 * We exclude both the rule group name AND the manualCollectionName (if different)
 * because the media server collection might use either name.
 *
 * @param ruleGroup - The rule group being evaluated
 * @returns Array of lowercase, trimmed collection names to exclude
 */
export function buildCollectionExcludeNames(ruleGroup?: RulesDto): string[] {
  const excludeNames: string[] = [];

  if (ruleGroup?.name) {
    excludeNames.push(ruleGroup.name.toLowerCase().trim());
  }

  if (
    ruleGroup?.collection?.manualCollectionName &&
    ruleGroup.collection.manualCollectionName.toLowerCase().trim() !==
      ruleGroup.name?.toLowerCase().trim()
  ) {
    excludeNames.push(
      ruleGroup.collection.manualCollectionName.toLowerCase().trim(),
    );
  }

  return excludeNames;
}
