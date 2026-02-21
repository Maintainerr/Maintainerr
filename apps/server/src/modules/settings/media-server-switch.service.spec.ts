import { MediaServerType } from '@maintainerr/contracts';
import { TestBed, type Mocked } from '@suites/unit';
import { DataSource, Repository } from 'typeorm';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionLog } from '../collections/entities/collection_log.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { MediaServerSwitchService } from './media-server-switch.service';
import { RuleMigrationService } from './rule-migration.service';
import { SettingsService } from './settings.service';

describe('MediaServerSwitchService', () => {
  let service: MediaServerSwitchService;
  let settingsService: Mocked<SettingsService>;
  let ruleMigrationService: Mocked<RuleMigrationService>;
  let dataSource: Mocked<DataSource>;
  let collectionRepo: Mocked<Repository<Collection>>;
  let collectionMediaRepo: Mocked<Repository<CollectionMedia>>;
  let collectionLogRepo: Mocked<Repository<CollectionLog>>;
  let exclusionRepo: Mocked<Repository<Exclusion>>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      MediaServerSwitchService,
    ).compile();

    service = unit;
    settingsService = unitRef.get(SettingsService);
    ruleMigrationService = unitRef.get(RuleMigrationService);
    dataSource = unitRef.get(DataSource);
    collectionRepo = unitRef.get('CollectionRepository');
    collectionMediaRepo = unitRef.get('CollectionMediaRepository');
    collectionLogRepo = unitRef.get('CollectionLogRepository');
    exclusionRepo = unitRef.get('ExclusionRepository');

    const mediaServerFactory = (
      service as unknown as {
        mediaServerFactory: {
          uninitializeServer: (type: MediaServerType) => void;
        };
      }
    ).mediaServerFactory;
    jest
      .spyOn(mediaServerFactory, 'uninitializeServer')
      .mockImplementation(() => undefined);
    unitRef.get(MaintainerrLogger);
  });

  const setupCommonPreviewMocks = () => {
    settingsService.getRadarrSettingsCount.mockResolvedValue(0);
    settingsService.getSonarrSettingsCount.mockResolvedValue(0);
    settingsService.seerrConfigured.mockReturnValue(false);
    settingsService.tautulliConfigured.mockReturnValue(false);

    collectionRepo.count.mockResolvedValue(3);
    collectionMediaRepo.count.mockResolvedValue(10);
    collectionLogRepo.count.mockResolvedValue(4);
    exclusionRepo.count.mockResolvedValue(2);
  };

  describe('previewSwitch', () => {
    it('should not call rule migration preview when current server type is null', async () => {
      setupCommonPreviewMocks();
      settingsService.getMediaServerType.mockReturnValue(null);

      const result = await service.previewSwitch(MediaServerType.JELLYFIN);

      expect(result.currentServerType).toBeNull();
      expect(result.ruleMigration).toBeUndefined();
      expect(ruleMigrationService.previewMigration).not.toHaveBeenCalled();
    });

    it('should call rule migration preview when current server type exists', async () => {
      setupCommonPreviewMocks();
      settingsService.getMediaServerType.mockReturnValue(MediaServerType.PLEX);
      ruleMigrationService.previewMigration.mockResolvedValue({
        canMigrate: true,
        totalGroups: 1,
        totalRules: 2,
        migratableRules: 2,
        skippedRules: 0,
        skippedDetails: [],
      });

      const result = await service.previewSwitch(MediaServerType.JELLYFIN);

      expect(ruleMigrationService.previewMigration).toHaveBeenCalledWith(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
      );
      expect(result.ruleMigration?.canMigrate).toBe(true);
      expect(result.dataToBeCleared.collections).toBe(3);
      expect(result.dataToBeCleared.collectionMedia).toBe(10);
      expect(result.dataToBeCleared.exclusions).toBe(2);
      expect(result.dataToBeCleared.collectionLogs).toBe(4);
    });
  });

  describe('executeSwitch', () => {
    const createQueryRunnerMock = () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      return {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          clear: jest.fn().mockResolvedValue(undefined),
          createQueryBuilder: jest.fn(() => qb),
          findOne: jest.fn().mockResolvedValue({ id: 1 }),
          save: jest.fn().mockResolvedValue(undefined),
        },
      };
    };

    it('should execute switch transaction successfully with migration', async () => {
      const queryRunner = createQueryRunnerMock();
      dataSource.createQueryRunner.mockReturnValue(queryRunner as any);

      settingsService.getMediaServerType.mockReturnValue(MediaServerType.PLEX);
      settingsService.init.mockResolvedValue(undefined);

      collectionRepo.count.mockResolvedValue(1);
      collectionMediaRepo.count.mockResolvedValue(2);
      collectionLogRepo.count.mockResolvedValue(3);
      exclusionRepo.count.mockResolvedValue(4);

      ruleMigrationService.migrateRules.mockResolvedValue({
        totalRules: 2,
        migratedRules: 2,
        skippedRules: 0,
        fullyMigratedGroups: 1,
        partiallyMigratedGroups: 0,
        skippedGroups: 0,
        skippedDetails: [],
      });

      const result = await service.executeSwitch({
        targetServerType: MediaServerType.JELLYFIN,
        migrateRules: true,
      });

      expect(result.status).toBe('OK');
      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();

      expect(ruleMigrationService.migrateRules).toHaveBeenCalledWith(
        MediaServerType.PLEX,
        MediaServerType.JELLYFIN,
        true,
        queryRunner.manager,
      );

      expect(settingsService.init).toHaveBeenCalled();
      expect(
        (
          service as unknown as {
            mediaServerFactory: {
              uninitializeServer: jest.Mock;
            };
          }
        ).mediaServerFactory.uninitializeServer,
      ).toHaveBeenCalledWith(MediaServerType.PLEX);
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should roll back transaction and return NOK when migration fails', async () => {
      const queryRunner = createQueryRunnerMock();
      dataSource.createQueryRunner.mockReturnValue(queryRunner as any);

      settingsService.getMediaServerType.mockReturnValue(MediaServerType.PLEX);
      collectionRepo.count.mockResolvedValue(1);
      collectionMediaRepo.count.mockResolvedValue(2);
      collectionLogRepo.count.mockResolvedValue(3);
      exclusionRepo.count.mockResolvedValue(4);

      ruleMigrationService.migrateRules.mockRejectedValue(
        new Error('migration failed'),
      );

      const result = await service.executeSwitch({
        targetServerType: MediaServerType.JELLYFIN,
        migrateRules: true,
      });

      expect(result.status).toBe('NOK');
      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(settingsService.init).not.toHaveBeenCalled();
      expect(
        (
          service as unknown as {
            mediaServerFactory: {
              uninitializeServer: jest.Mock;
            };
          }
        ).mediaServerFactory.uninitializeServer,
      ).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should return NOK when target server matches current server', async () => {
      settingsService.getMediaServerType.mockReturnValue(MediaServerType.PLEX);

      const result = await service.executeSwitch({
        targetServerType: MediaServerType.PLEX,
        migrateRules: false,
      });

      expect(result).toEqual({
        status: 'NOK',
        code: 0,
        message: 'Already using plex as media server',
      });
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('should reject concurrent switch attempts with ConflictException', async () => {
      const originalInternal = (
        service as unknown as {
          executeSwitchInternal: (request: {
            targetServerType: MediaServerType;
            migrateRules?: boolean;
          }) => Promise<unknown>;
        }
      ).executeSwitchInternal;

      let unblock: () => void = () => undefined;
      const pending = new Promise<void>((resolve) => {
        unblock = resolve;
      });

      (
        service as unknown as {
          executeSwitchInternal: jest.Mock;
        }
      ).executeSwitchInternal = jest.fn(async () => {
        await pending;
        return {
          status: 'OK',
          code: 1,
          message: 'done',
          clearedData: {
            collections: 0,
            collectionMedia: 0,
            exclusions: 0,
            collectionLogs: 0,
          },
        };
      });

      const firstSwitch = service.executeSwitch({
        targetServerType: MediaServerType.JELLYFIN,
        migrateRules: false,
      });

      await expect(
        service.executeSwitch({
          targetServerType: MediaServerType.PLEX,
          migrateRules: false,
        }),
      ).rejects.toThrow('A media server switch is already in progress');

      unblock();
      await firstSwitch;

      (
        service as unknown as {
          executeSwitchInternal: typeof originalInternal;
        }
      ).executeSwitchInternal = originalInternal;
    });

    it.each([
      {
        from: MediaServerType.PLEX,
        to: MediaServerType.JELLYFIN,
        existingSettings: {
          media_server_type: MediaServerType.PLEX,
          plex_name: 'My Plex',
          plex_hostname: 'plex.local',
          plex_port: 32400,
          plex_ssl: 1,
          plex_auth_token: 'plex-token',
        },
        clearedFields: {
          media_server_type: MediaServerType.JELLYFIN,
          plex_name: null,
          plex_hostname: null,
          plex_port: null,
          plex_ssl: null,
          plex_auth_token: null,
        },
      },
      {
        from: MediaServerType.JELLYFIN,
        to: MediaServerType.PLEX,
        existingSettings: {
          media_server_type: MediaServerType.JELLYFIN,
          jellyfin_url: 'http://jf.local:8096',
          jellyfin_api_key: 'jf-key',
          jellyfin_user_id: 'jf-user',
          jellyfin_server_name: 'Jellyfin',
        },
        clearedFields: {
          media_server_type: MediaServerType.PLEX,
          jellyfin_url: null,
          jellyfin_api_key: null,
          jellyfin_user_id: null,
          jellyfin_server_name: null,
        },
      },
    ])(
      'should clear old $from credentials when switching from $from to $to',
      async ({ from, to, existingSettings, clearedFields }) => {
        const queryRunner = createQueryRunnerMock();
        queryRunner.manager.findOne.mockResolvedValue({
          id: 1,
          ...existingSettings,
        });
        dataSource.createQueryRunner.mockReturnValue(queryRunner as any);

        settingsService.getMediaServerType.mockReturnValue(from);
        settingsService.init.mockResolvedValue(undefined);
        collectionRepo.count.mockResolvedValue(0);
        collectionMediaRepo.count.mockResolvedValue(0);
        collectionLogRepo.count.mockResolvedValue(0);
        exclusionRepo.count.mockResolvedValue(0);

        await service.executeSwitch({
          targetServerType: to,
          migrateRules: false,
        });

        expect(queryRunner.manager.save).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining(clearedFields),
        );
      },
    );
  });
});
