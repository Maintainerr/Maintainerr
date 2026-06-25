import { MediaItemType, normalizeArrTagLabel } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { RadarrApi } from '../api/servarr-api/helpers/radarr.helper';
import { SonarrApi } from '../api/servarr-api/helpers/sonarr.helper';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { findMetadataLookupMatch } from '../metadata/metadata-lookup.util';
import { MetadataService } from '../metadata/metadata.service';
import { SettingsDataService } from '../settings/settings-data.service';

type ArrService = 'radarr' | 'sonarr';

interface ArrInstanceRef {
  radarrSettingsId?: number | null;
  sonarrSettingsId?: number | null;
}

// A media-server item plus the provider ids cached on its CollectionMedia row.
// The ids are passed as resolution fallbacks (exactly like the *arr action
// handlers), so an item whose media-server metadata omits a tmdb/tvdb still
// resolves to its *arr entity.
interface ArrTagItem {
  mediaServerId: string;
  tmdbId?: number | null;
  tvdbId?: number | null;
}

interface ExclusionTagTarget extends ArrTagItem {
  type: MediaItemType | undefined;
}

// Resolving every delta item to its *arr id is a per-item metadata + *arr
// lookup; keep it modestly parallel (not the eval loop's concurrency) so a large
// first-enable run doesn't serialize, while never hammering the *arr instance.
const RESOLVE_CONCURRENCY = 5;
// The *arr editor accepts a single batch, but cap the id list per request so a
// huge membership change can't build an unbounded body.
const EDITOR_BATCH_SIZE = 100;

/**
 * Applies/removes Radarr & Sonarr tags as a side effect of Maintainerr state —
 * NOT an action slot. Two triggers share this plumbing:
 *
 * - **Membership (Behavior A):** while a `tagInArr` collection holds an item, the
 *   matching *arr entity carries a tag whose label is the collection / rule group
 *   name. Driven from the rule executor's per-run membership deltas.
 * - **Exclusion (Behavior B,
 *   https://features.maintainerr.info/posts/81):** when an item is excluded, the
 *   matching *arr entity gets a protective tag (default "dnd"); removal on
 *   un-exclude is opt-in.
 *
 * Everything here is strictly best-effort: it logs and swallows failures, never
 * throws, never mutates collection membership, and resolves items with the #3125
 * contract (undefined = transient → skip & retry; null = confirmed-not-tracked →
 * nothing to do). A transient blip therefore never strips a tag.
 *
 * v1 is gated to movie (Radarr) and show (Sonarr) — Sonarr has no per-season tag,
 * so season/episode collections are skipped with a debug log.
 *
 * Known edge cases (v1 behaviour):
 * - **Rename:** the membership tag is the *current* rule group name, so renaming a
 *   group leaves the old (renamed-from) tag orphaned on the *arr items until they
 *   churn or the user clears it; the new name is applied on the next membership
 *   change. Re-tagging the whole collection on rename is deferred.
 * - **Two groups sharing a name** share one tag (labels are case-insensitive);
 *   untagging from one can strip a tag the other still wants, but the other group
 *   re-adds it on its next run.
 * - **Stale id in an editor batch** (an item deleted from *arr between resolve and
 *   write) can't error the run: `resolveArrId` already drops not-tracked items
 *   (null), and `writeTags` goes through the best-effort `runPut` (returns false,
 *   never throws). A delete action therefore removes the tag with the object.
 */
@Injectable()
export class ServarrTagService {
  constructor(
    private readonly servarrService: ServarrService,
    private readonly metadataService: MetadataService,
    private readonly settings: SettingsDataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(ServarrTagService.name);
  }

  /**
   * Behavior A — reconcile *arr tags for the items that just entered/left a
   * collection this run. `added`/`removed` are the executor's rule-scope deltas
   * (manual / co-owned members are already excluded from `removed`), each
   * carrying the item's cached provider ids. The tag label is the collection
   * title (== rule group name).
   */
  public async syncMembershipTags(
    collection: Collection,
    added: ArrTagItem[],
    removed: ArrTagItem[],
  ): Promise<void> {
    try {
      if (!collection?.tagInArr) {
        return;
      }
      if (added.length === 0 && removed.length === 0) {
        return;
      }

      const service = this.serviceForType(collection.type);
      if (!service) {
        this.logger.debug(
          `Skipping *arr membership tagging for '${collection.title}': type '${collection.type}' is not taggable (movie/show only).`,
        );
        return;
      }

      const settingsId =
        service === 'radarr'
          ? collection.radarrSettingsId
          : collection.sonarrSettingsId;
      if (!settingsId) {
        this.logger.debug(
          `Skipping *arr membership tagging for '${collection.title}': no ${service} instance is selected.`,
        );
        return;
      }

      const client = await this.getClient(service, settingsId);
      if (!client) {
        return;
      }

      // The membership tag is the rule group name, normalized to the *arr tag
      // charset (^[a-z0-9-]+$). Groups named e.g. "Stale Movies" become
      // "stale-movies".
      const label = normalizeArrTagLabel(collection.title);
      if (!label) {
        this.logger.debug(
          `Skipping ${service} membership tagging for '${collection.title}': the name has no taggable characters.`,
        );
        return;
      }
      const tagId = await client.ensureTag(label);
      if (tagId === undefined) {
        this.logger.warn(
          `Couldn't ensure ${service} tag '${label}'; skipping tag sync for '${collection.title}'.`,
        );
        return;
      }

      const [addIds, removeIds] = await Promise.all([
        this.resolveArrIds(client, service, added),
        this.resolveArrIds(client, service, removed),
      ]);

      const tagged = await this.writeTags(
        client,
        service,
        addIds,
        tagId,
        'add',
      );
      const untagged = await this.writeTags(
        client,
        service,
        removeIds,
        tagId,
        'remove',
      );

      if (tagged > 0 || untagged > 0) {
        this.logger.log(
          `${service === 'radarr' ? 'Radarr' : 'Sonarr'} tag '${label}': tagged ${tagged}, untagged ${untagged} for collection '${collection.title}'.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `*arr membership tag sync failed for collection '${collection?.title}'`,
      );
      this.logger.debug(error);
    }
  }

  /**
   * Per-service exclusion-tag settings. Radarr and Sonarr are configured
   * independently; only the apply/remove logic below is shared.
   */
  private serviceSettings(service: ArrService): {
    enabled: boolean;
    label: string;
    untag: boolean;
  } {
    return service === 'radarr'
      ? {
          enabled: this.settings.radarr_tag_exclusions,
          label: this.settings.radarr_exclusion_tag,
          untag: this.settings.radarr_untag_on_unexclude,
        }
      : {
          enabled: this.settings.sonarr_tag_exclusions,
          label: this.settings.sonarr_exclusion_tag,
          untag: this.settings.sonarr_untag_on_unexclude,
        };
  }

  /** True if either *arr has exclusion tagging on — lets callers skip the
   * collection lookup entirely when both are off. */
  public anyExclusionTaggingEnabled(): boolean {
    return (
      this.settings.radarr_tag_exclusions || this.settings.sonarr_tag_exclusions
    );
  }

  /** True if either *arr has opt-in un-exclude removal on. */
  public anyExclusionUntaggingEnabled(): boolean {
    return (
      (this.settings.radarr_tag_exclusions &&
        this.settings.radarr_untag_on_unexclude) ||
      (this.settings.sonarr_tag_exclusions &&
        this.settings.sonarr_untag_on_unexclude)
    );
  }

  /** Cheap gate (by item type) so callers can skip the collection lookup. */
  public exclusionTaggingEnabled(type: MediaItemType | undefined): boolean {
    const service = this.serviceForType(type);
    return service ? this.serviceSettings(service).enabled : false;
  }

  /** Cheap gate (by item type) for the opt-in un-exclude removal. */
  public exclusionUntaggingEnabled(type: MediaItemType | undefined): boolean {
    const service = this.serviceForType(type);
    if (!service) {
      return false;
    }
    const s = this.serviceSettings(service);
    return s.enabled && s.untag;
  }

  /**
   * Behavior B — apply the protective exclusion tag to the excluded item's *arr
   * entity. No-ops unless exclusion tagging is enabled. The caller resolves the
   * instance: a collection-scoped exclusion uses its rule group's collection, a
   * global one the single configured instance (skipped when ambiguous). Adding on
   * exclude is unconditional when enabled.
   */
  public async applyExclusionTag(
    target: ExclusionTagTarget,
    instance: ArrInstanceRef,
  ): Promise<void> {
    if (!this.exclusionTaggingEnabled(target.type)) {
      return;
    }
    await this.tagExclusionTarget(target, instance, 'add');
  }

  /**
   * Behavior B — remove the protective exclusion tag on un-exclude. This is
   * conservative on purpose (Zipties' "second dnd source" pain): it only runs
   * when the user opts in via `<service>_untag_on_unexclude`, and even then only
   * ever touches the configured label — never the user's other tags. With the
   * default (opt-in OFF) a manually-set "dnd" is never stripped by Maintainerr.
   */
  public async removeExclusionTag(
    target: ExclusionTagTarget,
    instance: ArrInstanceRef,
  ): Promise<void> {
    if (!this.exclusionUntaggingEnabled(target.type)) {
      return;
    }
    await this.tagExclusionTarget(target, instance, 'remove');
  }

  private async tagExclusionTarget(
    target: ExclusionTagTarget,
    instance: ArrInstanceRef,
    mode: 'add' | 'remove',
  ): Promise<void> {
    try {
      const service = this.serviceForType(target.type);
      if (!service) {
        this.logger.debug(
          `Skipping *arr exclusion tagging for item ${target.mediaServerId}: type '${target.type}' is not taggable (movie/show only).`,
        );
        return;
      }

      const settingsId =
        service === 'radarr'
          ? instance.radarrSettingsId
          : instance.sonarrSettingsId;
      if (!settingsId) {
        this.logger.debug(
          `Skipping *arr exclusion tagging for item ${target.mediaServerId}: no ${service} instance associated with the exclusion.`,
        );
        return;
      }

      const label = normalizeArrTagLabel(
        this.serviceSettings(service).label ?? '',
      );
      if (!label) {
        this.logger.debug(
          `Skipping ${service} exclusion tagging: no usable exclusion tag label configured.`,
        );
        return;
      }

      const client = await this.getClient(service, settingsId);
      if (!client) {
        return;
      }

      const tagId = await client.ensureTag(label);
      if (tagId === undefined) {
        this.logger.warn(
          `Couldn't ensure ${service} tag '${label}'; skipping exclusion ${mode} for item ${target.mediaServerId}.`,
        );
        return;
      }

      const arrId = await this.resolveArrId(client, service, target);
      if (arrId == null) {
        // undefined = transient (retried on the next exclude/un-exclude),
        // null = the item isn't tracked in *arr — nothing to tag either way.
        return;
      }

      const written = await this.writeTags(
        client,
        service,
        [arrId],
        tagId,
        mode,
      );
      if (written > 0) {
        this.logger.log(
          `${mode === 'add' ? 'Applied' : 'Removed'} ${service} exclusion tag '${label}' ${mode === 'add' ? 'to' : 'from'} item ${target.mediaServerId}.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `*arr exclusion tag ${mode} failed for item ${target?.mediaServerId}`,
      );
      this.logger.debug(error);
    }
  }

  private serviceForType(
    type: MediaItemType | undefined,
  ): ArrService | undefined {
    if (type === 'movie') {
      return 'radarr';
    }
    if (type === 'show') {
      return 'sonarr';
    }
    return undefined;
  }

  private async getClient(
    service: ArrService,
    settingsId: number,
  ): Promise<RadarrApi | SonarrApi | undefined> {
    try {
      return service === 'radarr'
        ? await this.servarrService.getRadarrApiClient(settingsId)
        : await this.servarrService.getSonarrApiClient(settingsId);
    } catch (error) {
      this.logger.warn(
        `Couldn't get a ${service} API client for settings id ${settingsId}; skipping tag sync.`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * Resolve a set of media-server ids to *arr entity ids, dropping any that are
   * transiently unresolvable (undefined) or confirmed-not-tracked (null). Bounded
   * parallelism; deduped.
   */
  private async resolveArrIds(
    client: RadarrApi | SonarrApi,
    service: ArrService,
    items: ArrTagItem[],
  ): Promise<number[]> {
    const resolved = new Set<number>();
    for (const batch of this.chunk(items, RESOLVE_CONCURRENCY)) {
      const ids = await Promise.all(
        batch.map((item) => this.resolveArrId(client, service, item)),
      );
      for (const id of ids) {
        if (id != null) {
          resolved.add(id);
        }
      }
    }
    return [...resolved];
  }

  /**
   * Resolve one item to its *arr entity id. Returns:
   *   - a number when matched,
   *   - null when the item is confirmed not tracked in *arr (no candidates, or
   *     *arr returned an empty match),
   *   - undefined when the lookup transiently failed (so callers skip & retry,
   *     never untagging on a blip) — per the #3125 getter contract.
   * The item's cached tmdb/tvdb are passed as resolution fallbacks.
   */
  private async resolveArrId(
    client: RadarrApi | SonarrApi,
    service: ArrService,
    item: ArrTagItem,
  ): Promise<number | null | undefined> {
    const candidates =
      await this.metadataService.resolveLookupCandidatesForService(
        item.mediaServerId,
        service,
        {
          ...(item.tmdbId != null ? { tmdb: item.tmdbId } : {}),
          ...(item.tvdbId != null ? { tvdb: item.tvdbId } : {}),
        },
      );
    if (candidates.length === 0) {
      return null;
    }

    const matched =
      service === 'radarr'
        ? await findMetadataLookupMatch(candidates, {
            tmdb: (id) => (client as RadarrApi).getMovieByTmdbId(id),
          })
        : await findMetadataLookupMatch(candidates, {
            tvdb: (id) => (client as SonarrApi).getSeriesByTvdbId(id),
          });

    if (matched === undefined) {
      // Every candidate lookup transiently failed (transport/auth/5xx).
      return undefined;
    }

    // matched.result is the *arr entity, or null when *arr confirmed no match.
    return matched.result?.id ?? null;
  }

  private async writeTags(
    client: RadarrApi | SonarrApi,
    service: ArrService,
    arrIds: number[],
    tagId: number,
    mode: 'add' | 'remove',
  ): Promise<number> {
    if (arrIds.length === 0) {
      return 0;
    }

    let written = 0;
    for (const batch of this.chunk(arrIds, EDITOR_BATCH_SIZE)) {
      const ok =
        service === 'radarr'
          ? await (client as RadarrApi).setMovieTags(batch, tagId, mode)
          : await (client as SonarrApi).setSeriesTags(batch, tagId, mode);
      if (ok) {
        written += batch.length;
      }
    }
    return written;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }
}
