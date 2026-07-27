import {
  createMockLogger,
  createMockServarrTagService,
} from '../../../test/utils/data';
import { Application } from './constants/rules.constants';
import { RulesService } from './rules.service';

// getRuleConstants must only advertise applications the install can actually
// use: an unconfigured arr in the payload puts dead entries in the rule
// builder and lets users build rules that can never pass save validation.
describe('RulesService.getRuleConstants', () => {
  const logger = createMockLogger();

  // Settings with every non-arr integration configured, so only the arr
  // repo `exists()` flags drive the outcome under test.
  const settings = {
    seerr_api_key: 'key',
    seerr_url: 'http://seerr',
    tautulli_url: 'http://tautulli',
    tautulli_api_key: 'key',
    streamystats_url: 'http://streamystats',
    jellyfin_api_key: 'key',
  };

  const createRulesService = (exists: {
    radarr: boolean;
    sonarr: boolean;
    sportarr: boolean;
  }) =>
    new RulesService(
      {} as any, // rulesRepository
      {} as any, // ruleGroupRepository
      {} as any, // collectionMediaRepository
      {} as any, // communityRuleKarmaRepository
      {} as any, // exclusionRepo
      { findOne: jest.fn().mockResolvedValue(settings) } as any, // settingsRepo
      { exists: jest.fn().mockResolvedValue(exists.radarr) } as any,
      { exists: jest.fn().mockResolvedValue(exists.sonarr) } as any,
      { exists: jest.fn().mockResolvedValue(exists.sportarr) } as any,
      {} as any, // collectionService
      {} as any, // mediaServerFactory
      {} as any, // connection
      {} as any, // ruleYamlService
      {} as any, // ruleComparatorServiceFactory
      {} as any, // ruleMigrationService
      {} as any, // eventEmitter
      createMockServarrTagService() as any,
      logger as any,
    );

  const applicationIds = async (service: RulesService) =>
    (await service.getRuleConstants()).applications.map((a) => a.id);

  it('omits Sportarr when no Sportarr server is configured', async () => {
    const service = createRulesService({
      radarr: true,
      sonarr: true,
      sportarr: false,
    });

    const ids = await applicationIds(service);
    expect(ids).not.toContain(Application.SPORTARR);
    expect(ids).toContain(Application.SONARR);
  });

  it('includes Sportarr when a Sportarr server exists', async () => {
    const service = createRulesService({
      radarr: false,
      sonarr: false,
      sportarr: true,
    });

    const ids = await applicationIds(service);
    expect(ids).toContain(Application.SPORTARR);
    expect(ids).not.toContain(Application.SONARR);
    expect(ids).not.toContain(Application.RADARR);
  });
});
