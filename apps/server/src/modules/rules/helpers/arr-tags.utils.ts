import { Tag } from '../../api/servarr-api/interfaces/servarr.interface';

interface ArrTagClient {
  getTags(): Promise<Tag[] | undefined>;
}

/**
 * Resolves tag IDs to their human-readable label strings using an ARR API client.
 * Shared between Radarr and Sonarr getters — semantics are identical in both.
 * Returns undefined when getTags() fails (signals transient failure to the comparator).
 */
export async function resolveArrTagNames(
  tagIds: number[],
  client: ArrTagClient,
): Promise<string[] | undefined> {
  const allTags = await client.getTags();
  return allTags?.filter((t) => tagIds.includes(t.id)).map((t) => t.label);
}
