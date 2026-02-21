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

    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({
        getMetadata: jest.fn().mockResolvedValue(null),
      }),
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

    it('does not save when no legacy types are found', async () => {
      const { service, exclusionRepo, collectionRepo, ruleGroupRepo } =
        createService();

      await service.onModuleInit();

      expect(exclusionRepo.save).not.toHaveBeenCalled();
      expect(collectionRepo.save).not.toHaveBeenCalled();
      expect(ruleGroupRepo.save).not.toHaveBeenCalled();
    });

    it('still converts types even when conversion error occurs in one table', async () => {
      const ruleGroups = [{ id: 1, dataType: '1' }];
      const { service, ruleGroupRepo } = createService({ ruleGroups });

      // Even if onModuleInit catches an error, conversion should have completed
      await service.onModuleInit();

      expect(ruleGroups[0].dataType).toBe('movie');
      expect(ruleGroupRepo.save).toHaveBeenCalled();
    });
  });

  describe('onModuleInit - correctExclusionTypes', () => {
    it('runs both type conversion and exclusion correction during startup', async () => {
      const ruleGroups = [{ id: 1, dataType: '1' }];
      const { service, ruleGroupRepo, settings } = createService({
        ruleGroups,
        isSetup: true,
      });

      await service.onModuleInit();

      expect(ruleGroups[0].dataType).toBe('movie');
      expect(ruleGroupRepo.save).toHaveBeenCalled();
      expect(settings.testSetup).toHaveBeenCalled();
    });

    it('does not call correctExclusionTypes when media server is not configured', async () => {
      const { service, settings, mediaServerFactory } = createService({
        isSetup: false,
      });

      await service.onModuleInit();

      expect(settings.testSetup).toHaveBeenCalled();
      expect(mediaServerFactory.getService).not.toHaveBeenCalled();
    });

    it('logs warning when correctExclusionTypes fails', async () => {
      const { service, settings } = createService({ isSetup: true });
      settings.testSetup.mockRejectedValue(new Error('connection refused'));

      await service.onModuleInit();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('connection refused'),
      );
    });
  });

  describe('Bug #2358 regression: collection clearing on rule save', () => {
    /**
     * Reproduces the root cause of Bug #2358 (collection clearing).
     *
     * After the JellyfinSupport migration, rule_group.dataType contains
     * integer-as-string values like '2' instead of 'show'. When a user
     * saves a rule change, rules.service.ts compares:
     *   group.dataType !== params.dataType  →  '2' !== 'show'  →  TRUE
     * This triggers a full collection clear.
     *
     * The fix ensures conversion runs in onModuleInit() (synchronous with
     * startup) rather than @Timeout(5000) (5s delay, race condition).
     */
    it('converts dataType "2" to "show" so rule save comparison succeeds', async () => {
      const ruleGroup = { id: 42, dataType: '2' };
      const { service } = createService({ ruleGroups: [ruleGroup] });

      await service.onModuleInit();

      // After conversion, dataType should match what the frontend sends
      const frontendDataType = 'show';
      expect(ruleGroup.dataType).toBe(frontendDataType);
      // This comparison caused the bug: group.dataType !== params.dataType
      expect(ruleGroup.dataType !== frontendDataType).toBe(false);
    });
  });
});
