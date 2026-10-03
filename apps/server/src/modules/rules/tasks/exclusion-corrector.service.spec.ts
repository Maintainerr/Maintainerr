import { createMockLogger } from '../../../../test/utils/data';
import { ExclusionTypeCorrectorService } from './exclusion-corrector.service';

describe('ExclusionTypeCorrectorService', () => {
  const logger = createMockLogger();

  const createQueryBuilder = (results: any[]) => ({
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(results),
  });

  const createService = (options?: {
    exclusions?: any[];
    collections?: any[];
    ruleGroups?: any[];
    isSetup?: boolean;
    mediaServer?: { getMetadataBatch?: jest.Mock; itemExists?: jest.Mock };
  }) => {
    const {
      exclusions = [],
      collections = [],
      ruleGroups = [],
      isSetup = false,
    } = options ?? {};

    const exclusionRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilder(exclusions)),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const collectionRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilder(collections)),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const ruleGroupRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilder(ruleGroups)),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const mediaServer = {
      getMetadataBatch: jest.fn().mockResolvedValue([]),
      itemExists: jest.fn().mockResolvedValue(true),
      ...options?.mediaServer,
    };

    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };

    const settings = {
      testSetup: jest.fn().mockResolvedValue(isSetup),
    };

    const rulesService = {
      removeExclusion: jest.fn(),
    };

    const service = new ExclusionTypeCorrectorService(
      mediaServerFactory as any,
      settings as any,
      rulesService as any,
      exclusionRepo as any,
      collectionRepo as any,
      ruleGroupRepo as any,
      logger as any,
    );

    return {
      service,
      exclusionRepo,
      collectionRepo,
      ruleGroupRepo,
      settings,
      mediaServerFactory,
      mediaServer,
      rulesService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit - legacy integer type conversion', () => {
    it('converts legacy integer-as-string exclusion types to MediaItemType strings', async () => {
      const exclusions = [
        { id: 1, type: '1' },
        { id: 2, type: '2' },
        { id: 3, type: '3' },
        { id: 4, type: '4' },
      ];

      const { service, exclusionRepo } = createService({ exclusions });

      await service.onModuleInit();

      expect(exclusions[0].type).toBe('movie');
      expect(exclusions[1].type).toBe('show');
      expect(exclusions[2].type).toBe('season');
      expect(exclusions[3].type).toBe('episode');
      expect(exclusionRepo.save).toHaveBeenCalledWith(exclusions);
    });

    it('converts legacy integer-as-string collection types to MediaItemType strings', async () => {
      const collections = [
        { id: 10, type: '1' },
        { id: 11, type: '2' },
      ];

      const { service, collectionRepo } = createService({ collections });

      await service.onModuleInit();

      expect(collections[0].type).toBe('movie');
      expect(collections[1].type).toBe('show');
      expect(collectionRepo.save).toHaveBeenCalledWith(collections);
    });

    it('converts legacy integer-as-string rule_group dataType to MediaItemType strings', async () => {
      const ruleGroups = [
        { id: 20, dataType: '2' },
        { id: 21, dataType: '3' },
      ];

      const { service, ruleGroupRepo } = createService({ ruleGroups });

      await service.onModuleInit();

      expect(ruleGroups[0].dataType).toBe('show');
      expect(ruleGroups[1].dataType).toBe('season');
      expect(ruleGroupRepo.save).toHaveBeenCalledWith(ruleGroups);
    });
  });

  describe('onModuleInit - correctExclusionTypes', () => {
    it('logs warning when correctExclusionTypes fails', async () => {
      const { service, settings } = createService({ isSetup: true });
      settings.testSetup.mockRejectedValue(new Error('connection refused'));

      await service.onModuleInit();

      expect(logger.warn).toHaveBeenCalledWith(
        'Exclusion type corrections failed',
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'connection refused' }),
      );
    });
  });

  describe('correctExclusionTypes - stale vs unreachable media (#3307 follow-up)', () => {
    it('backfills the type and saves only corrected rows', async () => {
      const exclusions = [{ id: 1, type: null, mediaServerId: '11' }];
      const { service, exclusionRepo, rulesService, mediaServer } =
        createService({
          exclusions,
          isSetup: true,
          mediaServer: {
            getMetadataBatch: jest
              .fn()
              .mockResolvedValue([{ id: '11', type: 'movie' }]),
          },
        });

      await service.onModuleInit();

      expect(exclusions[0].type).toBe('movie');
      expect(rulesService.removeExclusion).not.toHaveBeenCalled();
      expect(exclusionRepo.save).toHaveBeenLastCalledWith([exclusions[0]]);
      // An item the batch answered for needs no confirmation of its own.
      expect(mediaServer.itemExists).not.toHaveBeenCalled();
    });

    it('removes an exclusion only on a confirmed 404 and does not re-save the removed row', async () => {
      const exclusions = [{ id: 1, type: null, mediaServerId: '11' }];
      const { service, exclusionRepo, rulesService } = createService({
        exclusions,
        isSetup: true,
        mediaServer: {
          itemExists: jest.fn().mockResolvedValue(false),
        },
      });

      await service.onModuleInit();

      expect(rulesService.removeExclusion).toHaveBeenCalledWith(1);
      // Saving the full list would re-insert the row removed above.
      expect(exclusionRepo.save).toHaveBeenLastCalledWith([]);
    });

    it('keeps the exclusion when the existence check is inconclusive', async () => {
      const exclusions = [{ id: 1, type: null, mediaServerId: '11' }];
      const { service, rulesService } = createService({
        exclusions,
        isSetup: true,
        mediaServer: {
          itemExists: jest.fn().mockRejectedValue(new Error('unreachable')),
        },
      });

      await service.onModuleInit();

      expect(rulesService.removeExclusion).not.toHaveBeenCalled();
    });
  });
});
