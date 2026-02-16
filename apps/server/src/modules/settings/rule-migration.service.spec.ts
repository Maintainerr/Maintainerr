import { MediaServerType } from '@maintainerr/contracts';
import { TestBed, type Mocked } from '@suites/unit';
import { Repository } from 'typeorm';
import {
  Application,
  RuleOperators,
  RulePossibility,
} from '../rules/constants/rules.constants';
import { RuleDto } from '../rules/dtos/rule.dto';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Rules } from '../rules/entities/rules.entities';
import { RuleMigrationService } from './rule-migration.service';

describe('RuleMigrationService', () => {
  let service: RuleMigrationService;
  let rulesRepo: Mocked<Repository<Rules>>;
  let ruleGroupRepo: Mocked<Repository<RuleGroup>>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(RuleMigrationService).compile();
    service = unit;
    rulesRepo = unitRef.get('RulesRepository');
    ruleGroupRepo = unitRef.get('RuleGroupRepository');
  });

  describe('previewMigration', () => {
    it('should return preview with all rules migratable when no incompatible properties used', async () => {
      // Create test rules using only compatible properties (id 0-27)
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: RuleOperators.AND,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 0], // addDate - compatible
            customVal: { ruleTypeId: 1, value: '30' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Test Group 1' } as RuleGroup,
        },
        {
          id: 2,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.EQUALS,
            firstVal: [Application.PLEX, 5], // viewCount - compatible
            customVal: { ruleTypeId: 0, value: '0' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Test Group 1' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      ruleGroupRepo.count.mockResolvedValue(1);

      const result = await service.previewMigration(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
      );

      expect(result.canMigrate).toBe(true);
      expect(result.totalRules).toBe(2);
      expect(result.migratableRules).toBe(2);
      expect(result.skippedRules).toBe(0);
      expect(result.skippedDetails).toHaveLength(0);
    });

    it('should identify rules with Plex-only properties as non-migratable', async () => {
      // Create a rule using watchlist_isWatchlisted (id 30) - Plex only
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.EQUALS,
            firstVal: [Application.PLEX, 30], // watchlist_isWatchlisted - Plex only
            customVal: { ruleTypeId: 3, value: 'true' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Watchlist Group' } as RuleGroup,
        },
        {
          id: 2,
          ruleGroupId: 2,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 0], // addDate - compatible
            customVal: { ruleTypeId: 1, value: '30' },
            section: 0,
          }),
          ruleGroup: { id: 2, name: 'Date Group' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      ruleGroupRepo.count.mockResolvedValue(2);

      const result = await service.previewMigration(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
      );

      expect(result.canMigrate).toBe(true);
      expect(result.totalRules).toBe(2);
      expect(result.migratableRules).toBe(1);
      expect(result.skippedRules).toBe(1);
      expect(result.skippedDetails).toHaveLength(1);
      expect(result.skippedDetails[0].ruleGroupName).toBe('Watchlist Group');
      expect(result.skippedDetails[0].propertyName).toBe(
        'watchlist_isWatchlisted',
      );
    });

    it('should return canMigrate false when no rules exist', async () => {
      rulesRepo.find.mockResolvedValue([]);
      ruleGroupRepo.count.mockResolvedValue(0);

      const result = await service.previewMigration(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
      );

      expect(result.canMigrate).toBe(false);
      expect(result.totalRules).toBe(0);
      expect(result.migratableRules).toBe(0);
    });
  });

  describe('migrateRules', () => {
    it('should migrate rules by updating application ID in ruleJson', async () => {
      const originalRule: Partial<Rules> = {
        id: 1,
        ruleGroupId: 1,
        ruleJson: JSON.stringify({
          operator: RuleOperators.AND,
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 0], // Plex addDate
          customVal: { ruleTypeId: 1, value: '30' },
          section: 0,
        }),
        ruleGroup: { id: 1, name: 'Test Group' } as RuleGroup,
      };

      rulesRepo.find.mockResolvedValue([originalRule as Rules]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
      );

      expect(result.migratedRules).toBe(1);
      expect(result.skippedRules).toBe(0);
      expect(rulesRepo.update).toHaveBeenCalledTimes(1);

      // Verify the updated ruleJson has Jellyfin application ID
      const updateCall = rulesRepo.update.mock.calls[0];
      const updatedJson = JSON.parse(updateCall[1].ruleJson as string);
      expect(updatedJson.firstVal[0]).toBe(Application.JELLYFIN);
      expect(updatedJson.firstVal[1]).toBe(0); // Property ID stays the same
    });

    it('should delete incompatible rules and clean up empty groups when skipIncompatible is true', async () => {
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.EQUALS,
            firstVal: [Application.PLEX, 30], // watchlist - incompatible
            customVal: { ruleTypeId: 3, value: 'true' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Watchlist Group' } as RuleGroup,
        },
        {
          id: 2,
          ruleGroupId: 2,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 0], // addDate - compatible
            customVal: { ruleTypeId: 1, value: '30' },
            section: 0,
          }),
          ruleGroup: { id: 2, name: 'Date Group' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);
      rulesRepo.delete.mockResolvedValue({ affected: 1 } as any);
      ruleGroupRepo.delete.mockResolvedValue({ affected: 1 } as any);

      const result = await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true, // skipIncompatible
      );

      expect(result.totalRules).toBe(2);
      expect(result.migratedRules).toBe(1);
      expect(result.skippedRules).toBe(1);
      expect(result.skippedDetails).toHaveLength(1);
      expect(rulesRepo.update).toHaveBeenCalledTimes(1);
      // Incompatible rule should be deleted
      expect(rulesRepo.delete).toHaveBeenCalledWith(1);
      // Group 1 had all rules incompatible, so it should be deleted
      expect(ruleGroupRepo.delete).toHaveBeenCalledWith(1);
    });

    it('should throw error for incompatible rules when skipIncompatible is false', async () => {
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.EQUALS,
            firstVal: [Application.PLEX, 31], // rating_imdb - Plex only
            customVal: { ruleTypeId: 0, value: '7' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'IMDB Group' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);

      await expect(
        service.migrateRules(
          MediaServerType.PLEX,
          MediaServerType.JELLYFIN,
          false, // Don't skip - throw on incompatible
        ),
      ).rejects.toThrow(/cannot be migrated/);
    });

    it('should also migrate lastVal if present', async () => {
      const originalRule: Partial<Rules> = {
        id: 1,
        ruleGroupId: 1,
        ruleJson: JSON.stringify({
          operator: RuleOperators.AND,
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 0], // addDate
          lastVal: [Application.PLEX, 2], // releaseDate
          section: 0,
        }),
        ruleGroup: { id: 1, name: 'Compare Dates' } as RuleGroup,
      };

      rulesRepo.find.mockResolvedValue([originalRule as Rules]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
      );

      const updateCall = rulesRepo.update.mock.calls[0];
      const updatedJson = JSON.parse(updateCall[1].ruleJson as string);
      expect(updatedJson.firstVal[0]).toBe(Application.JELLYFIN);
      expect(updatedJson.lastVal[0]).toBe(Application.JELLYFIN);
    });

    it('should not migrate rules from other applications (Radarr, Sonarr, etc)', async () => {
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.EQUALS,
            firstVal: [Application.RADARR, 0], // Radarr rule - should not be touched
            customVal: { ruleTypeId: 3, value: 'true' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Radarr Group' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
      );

      // Radarr rules should be "migrated" but unchanged
      expect(result.migratedRules).toBe(1);
      const updateCall = rulesRepo.update.mock.calls[0];
      const updatedJson = JSON.parse(updateCall[1].ruleJson as string);
      // Should still be Radarr, not changed to Jellyfin
      expect(updatedJson.firstVal[0]).toBe(Application.RADARR);
    });
  });

  describe('migrateImportedRuleDtos', () => {
    it('should migrate Plex rules to Jellyfin for community imports', () => {
      const rules: RuleDto[] = [
        {
          operator: RuleOperators.AND,
          action: RulePossibility.BIGGER,
          firstVal: [0, 0], // Use literal 0 for PLEX
          customVal: { ruleTypeId: 1, value: '30' },
          section: 0,
        },
      ];

      const result = service.migrateImportedRuleDtos(
        rules,
        MediaServerType.JELLYFIN,
      );

      expect(result.migratedRules).toBe(1);
      expect(result.rules[0].firstVal?.[0]).toBe(6); // 6 = JELLYFIN
    });
  });

  describe('rating property migration', () => {
    it('should migrate rating properties that exist in both Plex and Jellyfin at the same ID', async () => {
      // rating_rottenTomatoesCritic (id 32) now exists in both Plex and Jellyfin constants
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 32], // rating_rottenTomatoesCritic
            customVal: { ruleTypeId: 0, value: '7' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'RT Critic Group' } as RuleGroup,
        },
        {
          id: 2,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 34], // rating_tmdb
            customVal: { ruleTypeId: 0, value: '6' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'RT Critic Group' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
      );

      expect(result.migratedRules).toBe(2);
      expect(result.skippedRules).toBe(0);

      // Verify IDs mapped to Jellyfin app but kept property IDs
      const call1 = JSON.parse(
        rulesRepo.update.mock.calls[0][1].ruleJson as string,
      );
      expect(call1.firstVal[0]).toBe(Application.JELLYFIN);
      expect(call1.firstVal[1]).toBe(32); // Same property ID

      const call2 = JSON.parse(
        rulesRepo.update.mock.calls[1][1].ruleJson as string,
      );
      expect(call2.firstVal[0]).toBe(Application.JELLYFIN);
      expect(call2.firstVal[1]).toBe(34); // Same property ID
    });

    it('should preview rating properties as migratable', async () => {
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 36], // rating_rottenTomatoesCriticShow
            customVal: { ruleTypeId: 0, value: '5' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Rating Group' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      ruleGroupRepo.count.mockResolvedValue(1);

      const preview = await service.previewMigration(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
      );

      expect(preview.migratableRules).toBe(1);
      expect(preview.skippedRules).toBe(0);
    });

    it('should still flag watchlist properties as incompatible', async () => {
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.EQUALS,
            firstVal: [Application.PLEX, 28], // watchlist_isListedByUsers - truly incompatible
            customVal: { ruleTypeId: 4, value: 'testuser' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Watchlist Group' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      ruleGroupRepo.count.mockResolvedValue(1);

      const preview = await service.previewMigration(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
      );

      expect(preview.migratableRules).toBe(0);
      expect(preview.skippedRules).toBe(1);
      expect(preview.skippedDetails[0].propertyName).toBe(
        'watchlist_isListedByUsers',
      );
    });
  });

  describe('smart collection remapping', () => {
    it('should remap smart collection property IDs to non-smart equivalents', async () => {
      // Plex collectionsIncludingSmart (39) should remap to Jellyfin collections (6)
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 39], // collectionsIncludingSmart
            customVal: { ruleTypeId: 0, value: '2' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Smart Collections' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
      );

      expect(result.migratedRules).toBe(1);
      expect(result.skippedRules).toBe(0);

      const updatedJson = JSON.parse(
        rulesRepo.update.mock.calls[0][1].ruleJson as string,
      );
      expect(updatedJson.firstVal[0]).toBe(Application.JELLYFIN);
      // Property ID remapped from 39 (collectionsIncludingSmart) to 6 (collections)
      expect(updatedJson.firstVal[1]).toBe(6);
    });

    it('should remap collection_names_including_smart to collection_names', async () => {
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.CONTAINS,
            firstVal: [Application.PLEX, 42], // collection_names_including_smart
            customVal: { ruleTypeId: 4, value: 'Holiday' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Smart Names' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
      );

      expect(result.migratedRules).toBe(1);

      const updatedJson = JSON.parse(
        rulesRepo.update.mock.calls[0][1].ruleJson as string,
      );
      expect(updatedJson.firstVal[0]).toBe(Application.JELLYFIN);
      // Property ID remapped from 42 (collection_names_including_smart) to 19 (collection_names)
      expect(updatedJson.firstVal[1]).toBe(19);
    });

    it('should remap show-level smart collection properties', async () => {
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 40], // sw_collections_including_parent_and_smart
            customVal: { ruleTypeId: 0, value: '1' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Show Smart' } as RuleGroup,
        },
        {
          id: 2,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: RuleOperators.AND,
            action: RulePossibility.CONTAINS,
            firstVal: [Application.PLEX, 41], // sw_collection_names_including_parent_and_smart
            customVal: { ruleTypeId: 4, value: 'Sci-Fi' },
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Show Smart' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
      );

      expect(result.migratedRules).toBe(2);
      expect(result.skippedRules).toBe(0);

      // 40 -> 25 (sw_collections_including_parent)
      const call1 = JSON.parse(
        rulesRepo.update.mock.calls[0][1].ruleJson as string,
      );
      expect(call1.firstVal[1]).toBe(25);

      // 41 -> 26 (sw_collection_names_including_parent)
      const call2 = JSON.parse(
        rulesRepo.update.mock.calls[1][1].ruleJson as string,
      );
      expect(call2.firstVal[1]).toBe(26);
    });

    it('should also remap lastVal property IDs', async () => {
      const mockRules: Partial<Rules>[] = [
        {
          id: 1,
          ruleGroupId: 1,
          ruleJson: JSON.stringify({
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 39], // collectionsIncludingSmart
            lastVal: [Application.PLEX, 39], // also in lastVal
            section: 0,
          }),
          ruleGroup: { id: 1, name: 'Both Vals' } as RuleGroup,
        },
      ];

      rulesRepo.find.mockResolvedValue(mockRules as Rules[]);
      rulesRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.migrateRules(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
      );

      const updatedJson = JSON.parse(
        rulesRepo.update.mock.calls[0][1].ruleJson as string,
      );
      expect(updatedJson.firstVal).toEqual([Application.JELLYFIN, 6]);
      expect(updatedJson.lastVal).toEqual([Application.JELLYFIN, 6]);
    });
  });

  describe('getApplicationId', () => {
    it('should throw for unknown server type', async () => {
      rulesRepo.find.mockResolvedValue([]);

      await expect(
        service.previewMigration(
          'unknown' as MediaServerType,
          MediaServerType.JELLYFIN,
        ),
      ).rejects.toThrow(/Unknown media server type/);
    });
  });
});
