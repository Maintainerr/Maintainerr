import {
  createMockLogger,
  createMockServarrTagService,
} from '../../../test/utils/data';
import { TracearrApiService } from '../api/tracearr-api/tracearr-api.service';
import { Application, RulePossibility } from './constants/rules.constants';
import { Rules } from './entities/rules.entities';
import { RulesService } from './rules.service';

describe('RulesService Test Media Tracearr freshness', () => {
  const createService = (firstValue: [number, number]) => {
    const tracearrApi = {
      invalidateHistory: jest.fn(),
    } as unknown as jest.Mocked<TracearrApiService>;
    const mediaServer = {
      resetMetadataCache: jest.fn(),
      getMetadata: jest.fn().mockResolvedValue({ id: 'movie-1' }),
    };
    const rule = {
      id: 1,
      ruleGroupId: 1,
      section: 0,
      isActive: true,
      ruleJson: JSON.stringify({
        operator: null,
        action: RulePossibility.NOT_EXISTS,
        firstVal: firstValue,
        section: 0,
      }),
    } as Rules;
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([rule]),
    };
    const comparator = {
      executeRulesWithData: jest.fn().mockResolvedValue({ stats: [] }),
    };
    const service = new RulesService(
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({ id: 1, useRules: true }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getService: jest.fn().mockResolvedValue(mediaServer) } as never,
      {
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        }),
      } as never,
      {} as never,
      { create: jest.fn().mockReturnValue(comparator) } as never,
      {} as never,
      {} as never,
      createMockServarrTagService() as never,
      createMockLogger() as never,
      tracearrApi,
      { getUsernames: jest.fn().mockResolvedValue([]) } as any,
    );

    return { service, tracearrApi, comparator };
  };

  it('refreshes Tracearr history before Test Media compares a Tracearr rule', async () => {
    const { service, tracearrApi, comparator } = createService([
      Application.TRACEARR,
      3,
    ]);

    await expect(service.testRuleGroupWithData(1, 'movie-1')).resolves.toEqual({
      code: 1,
      result: [],
    });

    expect(tracearrApi.invalidateHistory).toHaveBeenCalledTimes(1);
    expect(comparator.executeRulesWithData).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate Tracearr history for other Test Media rules', async () => {
    const { service, tracearrApi } = createService([Application.PLEX, 5]);

    await service.testRuleGroupWithData(1, 'movie-1');

    expect(tracearrApi.invalidateHistory).not.toHaveBeenCalled();
  });
});
