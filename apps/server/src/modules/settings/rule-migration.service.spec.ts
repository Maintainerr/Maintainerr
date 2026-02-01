import { TestBed, type Mocked } from '@suites/unit';
import { Repository } from 'typeorm';
import { RuleMigrationService } from './rule-migration.service';
import { Rules } from '../rules/entities/rules.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { MediaServerType } from '@maintainerr/contracts';
import {
  Application,
  RuleOperators,
  RulePossibility,
} from '../rules/constants/rules.constants';

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

    it('should skip rules with incompatible properties when skipIncompatible is true', async () => {
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
