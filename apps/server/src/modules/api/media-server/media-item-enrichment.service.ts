import {
  type MaintainerrMediaStatusDetails,
  type MaintainerrMediaStatusEntry,
  type MediaItem,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { CollectionMedia } from '../../collections/entities/collection_media.entities';
import { Exclusion } from '../../rules/entities/exclusion.entities';
import { RuleGroup } from '../../rules/entities/rule-group.entities';

interface ExclusionState {
  id: number;
  type: 'global' | 'specific';
}

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

    const [exclusionMap, manuallyIncludedItemIds] = await Promise.all([
      this.fetchExclusionMap(relationIds),
      this.fetchManuallyIncludedItemIds(directIds),
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
      const isManuallyIncluded = manuallyIncludedItemIds.has(item.id);

      if (!exclusion && !isManuallyIncluded) {
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
    const exclusions = await this.exclusionRepo.find({
      where: [{ mediaServerId: In(ids) }, { parent: In(ids) }],
    });
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

  private async fetchManuallyIncludedItemIds(
    ids: string[],
  ): Promise<Set<string>> {
    const collectionMedia = await this.collectionMediaRepo.find({
      where: {
        mediaServerId: In(ids),
        manualMembershipSource: Not(IsNull()),
      },
    });

    return new Set(
      collectionMedia
        .map((item) => item.mediaServerId)
        .filter((mediaServerId): mediaServerId is string =>
          Boolean(mediaServerId),
        ),
    );
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
