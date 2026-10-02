import { MediaServerType } from '@maintainerr/contracts';
import {
  createMockLogger,
  createMockServarrTagService,
} from '../../../test/utils/data';
import cacheManager, { Cache } from '../api/lib/cache';
import { RuleGroupDto } from './dtos/ruleGroup.dto';
import { RulesService } from './rules.service';

/**
 * Focused test for `resetCacheIfGroupUsesRuleThatRequiresIt` covering the
 * server-type dispatch into the cache registry. The method's logic is small
 * (three switch branches), but each branch flushes a different named cache,
 * so the per-server routing is the part worth pinning.
 */
describe('RulesService.resetCacheIfGroupUsesRuleThatRequiresIt', () => {
  const logger = createMockLogger();

  type FactoryStub = {
    getConfiguredServerType: jest.Mock<Promise<MediaServerType>, []>;
  };

  const createRulesService = (factory: FactoryStub) =>
    new RulesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      factory as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      createMockServarrTagService() as any,
      logger as any,
      {} as any,
      { getUsernames: jest.fn().mockResolvedValue([]) } as any,
    );

  const stubGetRuleConstants = (service: RulesService) => {
    // Single dummy application+property tree where the property used in the
    // mock rule below has cacheReset = true, forcing the flush branch.
    jest.spyOn(service, 'getRuleConstants').mockResolvedValue({
      applications: [
        {
          id: 99,
          name: 'TestApp',
          mediaType: 0 as any,
          props: [
            {
              id: 0,
              name: 'cachedProp',
              humanName: 'Cached Prop',
              mediaType: 0 as any,
              type: { key: 'number', possibilities: [] } as any,
              cacheReset: true,
            },
          ],
        },
      ],
    } as any);
  };

  const ruleGroup = {
    rules: [
      {
        ruleJson: JSON.stringify({
          operator: null,
          action: 0,
          firstVal: [99, 0],
          customVal: { ruleTypeId: 0, value: '1' },
          section: 0,
        }),
      },
    ],
  } as unknown as RuleGroupDto;

  const spyOnCache = (cacheId: 'plextv' | 'plexguid' | 'jellyfin' | 'emby') => {
    const cache = cacheManager.getCache(cacheId) as Cache;
    return jest.spyOn(cache, 'flush').mockImplementation(() => undefined);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [MediaServerType.EMBY, ['emby']],
    [MediaServerType.JELLYFIN, ['jellyfin']],
    [MediaServerType.PLEX, ['plextv', 'plexguid']],
  ] as const)('on %s flushes %j', async (serverType, cacheIds) => {
    const flushes = cacheIds.map(spyOnCache);
    const service = createRulesService({
      getConfiguredServerType: jest.fn().mockResolvedValue(serverType),
    });
    stubGetRuleConstants(service);

    await expect(
      service.resetCacheIfGroupUsesRuleThatRequiresIt(ruleGroup),
    ).resolves.toBe(true);
    for (const flush of flushes) {
      expect(flush).toHaveBeenCalledTimes(1);
    }
  });
});
