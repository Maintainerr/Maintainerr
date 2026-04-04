import { type MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CollectionMedia } from '../../collections/entities/collection_media.entities';
import { Exclusion } from '../../rules/entities/exclusion.entities';

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

    const [exclusionMap, manualItemIds] = await Promise.all([
      this.fetchExclusionMap(relationIds),
      this.fetchManualItemIds(directIds),
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
      const isManual = manualItemIds.has(item.id);

      if (!exclusion && !isManual) {
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
        ...(isManual
          ? {
              maintainerrIsManual: true,
            }
          : {}),
      };
    });
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

  private async fetchManualItemIds(ids: string[]): Promise<Set<string>> {
    const collectionMedia = await this.collectionMediaRepo.find({
      where: { mediaServerId: In(ids), isManual: true },
    });

    return new Set(
      collectionMedia
        .map((item) => item.mediaServerId)
        .filter((mediaServerId): mediaServerId is string =>
          Boolean(mediaServerId),
        ),
    );
  }
}
