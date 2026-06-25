import { MediaServerType } from '@maintainerr/contracts';
import {
  createMockLogger,
  createMockServarrTagService,
} from '../../../test/utils/data';
import cacheManager, { Cache } from '../api/lib/cache';
import { RulesDto } from './dtos/rules.dto';
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
      factory as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      createMockServarrTagService() as any,
      logger as any,
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
  } as unknown as RulesDto;

  const spyOnCache = (cacheId: 'plextv' | 'plexguid' | 'jellyfin' | 'emby') => {
    const cache = cacheManager.getCache(cacheId) as Cache;
    return jest.spyOn(cache, 'flush').mockImplementation(() => undefined);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flushes the Emby cache when the configured server type is Emby', async () => {
    const flush = spyOnCache('emby');
    const factory: FactoryStub = {
      getConfiguredServerType: jest
        .fn()
        .mockResolvedValue(MediaServerType.EMBY),
    };
    const service = createRulesService(factory);
    stubGetRuleConstants(service);

    const result =
      await service.resetCacheIfGroupUsesRuleThatRequiresIt(ruleGroup);

    expect(result).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('flushes the Jellyfin cache when the configured server type is Jellyfin', async () => {
    const flush = spyOnCache('jellyfin');
    const factory: FactoryStub = {
      getConfiguredServerType: jest
        .fn()
        .mockResolvedValue(MediaServerType.JELLYFIN),
    };
    const service = createRulesService(factory);
    stubGetRuleConstants(service);

    await service.resetCacheIfGroupUsesRuleThatRequiresIt(ruleGroup);

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('flushes both Plex caches when the configured server type is Plex', async () => {
    const flushTv = spyOnCache('plextv');
    const flushGuid = spyOnCache('plexguid');
    const factory: FactoryStub = {
      getConfiguredServerType: jest
        .fn()
        .mockResolvedValue(MediaServerType.PLEX),
    };
    const service = createRulesService(factory);
    stubGetRuleConstants(service);

    await service.resetCacheIfGroupUsesRuleThatRequiresIt(ruleGroup);

    expect(flushTv).toHaveBeenCalledTimes(1);
    expect(flushGuid).toHaveBeenCalledTimes(1);
  });
});
