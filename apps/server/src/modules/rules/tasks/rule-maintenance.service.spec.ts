import { createMockLogger } from '../../../../test/utils/data';
import { RuleMaintenanceService } from './rule-maintenance.service';

describe('RuleMaintenanceService - removeLeftoverExclusions', () => {
  const createService = (options?: {
    exclusions?: any[];
    itemExists?: jest.Mock;
    getMetadataBatch?: jest.Mock;
  }) => {
    const { exclusions = [] } = options ?? {};

    const mediaServer = {
      getMetadataBatch:
        options?.getMetadataBatch ?? jest.fn().mockResolvedValue([]),
      itemExists: options?.itemExists ?? jest.fn().mockResolvedValue(true),
    };

    const rulesService = {
      getAllExclusions: jest.fn().mockResolvedValue(exclusions),
      getRuleGroups: jest.fn().mockResolvedValue([]),
      removeExclusion: jest.fn(),
    };

    const service = new RuleMaintenanceService(
      { createJob: jest.fn(), updateJob: jest.fn() } as any,
      createMockLogger() as any,
      {
        testMediaServerConnection: jest.fn().mockResolvedValue(true),
      } as any,
      rulesService as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getService: jest.fn().mockResolvedValue(mediaServer) } as any,
      { removeStaleCollectionMedia: jest.fn() } as any,
    );

    return { service, rulesService, mediaServer };
  };

  it('removes an exclusion only when the media server confirms the item is gone', async () => {
    const { service, rulesService } = createService({
      exclusions: [{ id: 1, mediaServerId: '11' }],
      itemExists: jest.fn().mockResolvedValue(false),
    });

    await (service as any).executeTask();

    expect(rulesService.removeExclusion).toHaveBeenCalledWith(1);
  });

  it('keeps the exclusion when the existence check is inconclusive (#3307 follow-up)', async () => {
    // getMetadata-based checks removed exclusions on a transient blip; the
    // itemExists contract throws on inconclusive and must not delete.
    const { service, rulesService } = createService({
      exclusions: [{ id: 1, mediaServerId: '11' }],
      itemExists: jest.fn().mockRejectedValue(new Error('unreachable')),
    });

    await (service as any).executeTask();

    expect(rulesService.removeExclusion).not.toHaveBeenCalled();
  });

  it('keeps the exclusion when the item still exists', async () => {
    const { service, rulesService } = createService({
      exclusions: [{ id: 1, mediaServerId: '11' }],
    });

    await (service as any).executeTask();

    expect(rulesService.removeExclusion).not.toHaveBeenCalled();
  });

  it('does not check an exclusion the batched read already answered for', async () => {
    const itemExists = jest.fn().mockResolvedValue(false);
    const { service, rulesService } = createService({
      exclusions: [
        { id: 1, mediaServerId: '11' },
        { id: 2, mediaServerId: '22' },
      ],
      getMetadataBatch: jest.fn().mockResolvedValue([{ id: '11' }]),
      itemExists,
    });

    await (service as any).executeTask();

    expect(itemExists).toHaveBeenCalledTimes(1);
    expect(itemExists).toHaveBeenCalledWith('22');
    expect(rulesService.removeExclusion).toHaveBeenCalledTimes(1);
    expect(rulesService.removeExclusion).toHaveBeenCalledWith(2);
  });
});
