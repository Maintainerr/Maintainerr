import {
  type MaintainerrMediaStatusDetails,
  type MaintainerrMediaStatusEntry,
  type MediaItem,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { chunk } from 'lodash';
import { In, IsNull, Not, Repository } from 'typeorm';
import { CollectionMedia } from '../../collections/entities/collection_media.entities';
import { Exclusion } from '../../rules/entities/exclusion.entities';
import { RuleGroup } from '../../rules/entities/rule-group.entities';

interface ExclusionState {
  id: number;
  type: 'global' | 'specific';
}

interface CollectionMembership {
  manuallyIncludedIds: Set<string>;
  collectionTitles: Map<string, string[]>;
}

// SQLite binds at most 32766 parameters, and a status-sorted sweep reaches
// thousands of ids: three relation ids per item, and the exclusion read binds
// each of them twice. 2048 leaves that widest read 8x of headroom, and measured
// flat against 500 through 16000 - the sweep costs per row, not per query.
export const ENRICHMENT_ID_CHUNK = 2048;

@Injectable()
export class MediaItemEnrichmentService {
  constructor(
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
  ) {}

  async enrichItems(items: MediaItem[]): Promise<MediaItem[]> {
    if (items.length === 0) {
      return items;
    }

    const relationIds = Array.from(
      new Set(
        items.flatMap((item) =>
          [item.id, item.parentId, item.grandparentId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    );
    const directIds = Array.from(new Set(items.map((item) => item.id)));

    if (relationIds.length === 0) {
      return items;
    }

    const [exclusionMap, membership] = await Promise.all([
      this.fetchExclusionMap(relationIds),
      this.fetchCollectionMembership(directIds),
    ]);

    return items.map((item) => {
      const itemRelationIds = [
        item.id,
        item.parentId,
        item.grandparentId,
      ].filter((id): id is string => Boolean(id));
      const exclusion = itemRelationIds
        .map((id) => exclusionMap.get(id))
        .find((value): value is ExclusionState => value !== undefined);
      const isManuallyIncluded = membership.manuallyIncludedIds.has(item.id);
      const collections = membership.collectionTitles.get(item.id);

      if (!exclusion && !isManuallyIncluded && !collections) {
        return item;
      }

      return {
        ...item,
        ...(exclusion
          ? {
              maintainerrExclusionId: exclusion.id,
              maintainerrExclusionType: exclusion.type,
            }
          : {}),
        ...(isManuallyIncluded
          ? {
              maintainerrIsManual: true,
            }
          : {}),
        ...(collections ? { maintainerrCollections: collections } : {}),
      };
    });
  }

  async getMaintainerrStatusDetails(
    item: Pick<MediaItem, 'id' | 'parentId' | 'grandparentId'>,
  ): Promise<MaintainerrMediaStatusDetails> {
    const relationIds = Array.from(
      new Set(
        [item.id, item.parentId, item.grandparentId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    );

    if (relationIds.length === 0) {
      return {
        excludedFrom: [],
        manuallyAddedTo: [],
      };
    }

    const [exclusions, manualCollectionMedia] = await Promise.all([
      this.exclusionRepo.find({
        where: [
          { mediaServerId: In(relationIds) },
          { parent: In(relationIds) },
        ],
      }),
      this.collectionMediaRepo.find({
        where: {
          mediaServerId: item.id,
          manualMembershipSource: Not(IsNull()),
        },
        relations: { collection: true },
      }),
    ]);

    return {
      excludedFrom: await this.buildExcludedFromEntries(exclusions),
      manuallyAddedTo: this.buildManualCollectionEntries(manualCollectionMedia),
    };
  }

  private async fetchExclusionMap(
    ids: string[],
  ): Promise<Map<string, ExclusionState>> {
    const exclusions: Exclusion[] = [];

    for (const idBatch of chunk(ids, ENRICHMENT_ID_CHUNK)) {
      exclusions.push(
        // A row can match one batch on mediaServerId and another on parent. The
        // map below is written per id, so the repeat is a no-op.
        ...(await this.exclusionRepo.find({
          where: [{ mediaServerId: In(idBatch) }, { parent: In(idBatch) }],
        })),
      );
    }

    const map = new Map<string, ExclusionState>();

    exclusions.forEach((exclusion) => {
      const state: ExclusionState = {
        id: exclusion.id,
        type: exclusion.ruleGroupId == null ? 'global' : 'specific',
      };

      [exclusion.mediaServerId, exclusion.parent]
        .filter((id): id is string => Boolean(id))
        .forEach((id) => {
          const existingState = map.get(id);
          if (!existingState || state.type === 'global') {
            map.set(id, state);
          }
        });
    });

    return map;
  }

  /** The manual set is a subset of the same rows, so it costs no second read. */
  private async fetchCollectionMembership(
    ids: string[],
  ): Promise<CollectionMembership> {
    const collectionMedia: CollectionMedia[] = [];

    for (const idBatch of chunk(ids, ENRICHMENT_ID_CHUNK)) {
      collectionMedia.push(
        ...(await this.collectionMediaRepo.find({
          where: { mediaServerId: In(idBatch) },
          relations: { collection: true },
        })),
      );
    }

    const manuallyIncludedIds = new Set<string>();
    const collectionTitles = new Map<string, string[]>();

    collectionMedia.forEach((item) => {
      if (!item.mediaServerId) {
        return;
      }

      if (item.manualMembershipSource != null) {
        manuallyIncludedIds.add(item.mediaServerId);
      }

      const title = item.collection?.title?.trim();
      if (!title) {
        return;
      }

      const titles = collectionTitles.get(item.mediaServerId) ?? [];
      if (!titles.includes(title)) {
        titles.push(title);
        collectionTitles.set(item.mediaServerId, titles);
      }
    });

    collectionTitles.forEach((titles) =>
      titles.sort((leftTitle, rightTitle) =>
        leftTitle.localeCompare(rightTitle),
      ),
    );

    return { manuallyIncludedIds, collectionTitles };
  }

  private async buildExcludedFromEntries(
    exclusions: Exclusion[],
  ): Promise<MaintainerrMediaStatusEntry[]> {
    const entries: MaintainerrMediaStatusEntry[] = [];

    if (exclusions.some((exclusion) => exclusion.ruleGroupId == null)) {
      entries.push({ label: 'Global' });
    }

    const ruleGroupIds = Array.from(
      new Set(
        exclusions
          .map((exclusion) => exclusion.ruleGroupId)
          .filter((ruleGroupId): ruleGroupId is number => ruleGroupId != null),
      ),
    );

    if (ruleGroupIds.length === 0) {
      return entries;
    }

    const ruleGroups = await this.ruleGroupRepo.find({
      where: { id: In(ruleGroupIds) },
      relations: { collection: true },
    });
    const ruleGroupMap = new Map(
      ruleGroups.map((ruleGroup) => [ruleGroup.id, ruleGroup]),
    );

    const specificEntries = ruleGroupIds
      .map((ruleGroupId) => {
        const ruleGroup = ruleGroupMap.get(ruleGroupId);
        const collection = ruleGroup?.collection;

        return {
          label:
            collection?.title?.trim() ||
            ruleGroup?.name?.trim() ||
            `Rule ${ruleGroupId}`,
          targetPath: collection?.id
            ? `/collections/${collection.id}/exclusions`
            : `/rules/edit/${ruleGroupId}`,
        } satisfies MaintainerrMediaStatusEntry;
      })
      .sort((leftItem, rightItem) =>
        leftItem.label.localeCompare(rightItem.label),
      );

    return [...entries, ...specificEntries];
  }

  private buildManualCollectionEntries(
    collectionMedia: CollectionMedia[],
  ): MaintainerrMediaStatusEntry[] {
    const collectionMap = new Map<number, MaintainerrMediaStatusEntry>();

    collectionMedia.forEach((item) => {
      const collection = item.collection;

      if (!collection?.id || collectionMap.has(collection.id)) {
        return;
      }

      const daysLeft = this.getManualCollectionDaysLeft(
        item.addDate,
        collection.deleteAfterDays,
      );

      collectionMap.set(collection.id, {
        label: `${collection.title}${daysLeft != null ? ` (${daysLeft}d left)` : ''}`,
        targetPath: `/collections/${collection.id}`,
      });
    });

    return Array.from(collectionMap.values()).sort((leftItem, rightItem) =>
      leftItem.label.localeCompare(rightItem.label),
    );
  }

  private getManualCollectionDaysLeft(
    addDate?: Date,
    deleteAfterDays?: number,
  ): number | undefined {
    if (!addDate || !deleteAfterDays || deleteAfterDays <= 0) {
      return undefined;
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const expiresAt = new Date(addDate).getTime() + deleteAfterDays * dayMs;
    const daysLeft = Math.ceil((expiresAt - Date.now()) / dayMs);

    return daysLeft > 0 ? daysLeft : undefined;
  }
}
