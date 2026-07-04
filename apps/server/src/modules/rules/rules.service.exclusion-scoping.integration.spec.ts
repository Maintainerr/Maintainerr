import { DataSource, EntitySchema, Repository } from 'typeorm';
import {
  createMockLogger,
  createMockServarrTagService,
} from '../../../test/utils/data';
import {
  buildExclusionCascadeSets,
  isMediaItemExcluded,
} from './helpers/exclusion-cascade.helper';
import { RulesService } from './rules.service';

// Deterministic, real-DB integration test for cross-group exclusion scoping.
//
// This composes the two real pieces the rule executor uses:
//   1. RulesService.getExclusions(rulegroupId)  - against a real SQLite repo
//   2. the executor's gate: `if (!isMediaItemExcluded(cascade, item)) add(item)`
//      (rule-executor.service.ts handleCollection)
//
// It proves end-to-end that an item excluded *in another group* IS added to a
// group that didn't exclude it, while global exclusions still apply everywhere.
// No cron/scheduler/media-server - fully reproducible (unlike a live dev run).

// EntitySchema mirror of the Exclusion entity (avoids decorator/metadata setup).
const ExclusionSchema = new EntitySchema<any>({
  name: 'Exclusion',
  tableName: 'exclusion',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    mediaServerId: { type: 'varchar', nullable: true },
    ruleGroupId: { type: 'integer', nullable: true },
    parent: { type: 'varchar', nullable: true },
    type: { type: 'varchar', nullable: true },
  },
});

const GROUP_A = 168; // owns a scoped exclusion for MOVIE_X
const GROUP_B = 169; // a different group
const MOVIE_X = 'movie-x'; // scoped-excluded in A only
const MOVIE_G = 'movie-global'; // globally excluded

describe('Exclusion scoping (real DB) - excluded-in-A item is added in B', () => {
  let ds: DataSource;
  let repo: Repository<any>;
  let service: RulesService;

  const makeService = (exclusionRepo: Repository<any>) =>
    new RulesService(
      {} as any, // rulesRepository
      {} as any, // ruleGroupRepository
      {} as any, // collectionMediaRepository
      {} as any, // communityRuleKarmaRepository
      exclusionRepo as any,
      {} as any, // settingsRepo
      {} as any, // radarrSettingsRepo
      {} as any, // sonarrSettingsRepo
      {} as any, // collectionService
      {} as any, // mediaServerFactory
      {} as any, // connection
      {} as any, // ruleYamlService
      {} as any, // ruleComparatorServiceFactory
      {} as any, // ruleMigrationService
      { emit: jest.fn() } as any, // eventEmitter
      createMockServarrTagService() as any,
      createMockLogger() as any,
    );

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [ExclusionSchema],
      synchronize: true,
    });
    await ds.initialize();
    repo = ds.getRepository('Exclusion');
    await repo.save([
      { mediaServerId: MOVIE_X, ruleGroupId: GROUP_A, type: 'movie' },
      { mediaServerId: MOVIE_G, ruleGroupId: null, type: 'movie' },
    ]);
    service = makeService(repo);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  // Mirrors the executor gate: item is ADDED when not excluded.
  const isAddedTo = async (rulegroupId: number, itemId: string) => {
    const exclusions = await service.getExclusions(rulegroupId);
    const cascade = buildExclusionCascadeSets(exclusions as any);
    return !isMediaItemExcluded(cascade, { id: itemId });
  };

  it('group B (no own exclusion for MOVIE_X) ADDS it - the A-scoped exclusion does not leak', async () => {
    expect(await isAddedTo(GROUP_B, MOVIE_X)).toBe(true);
  });

  it('group A (owns the exclusion) keeps MOVIE_X excluded', async () => {
    expect(await isAddedTo(GROUP_A, MOVIE_X)).toBe(false);
  });

  it('a global exclusion still applies in every group', async () => {
    expect(await isAddedTo(GROUP_A, MOVIE_G)).toBe(false);
    expect(await isAddedTo(GROUP_B, MOVIE_G)).toBe(false);
  });

  it('getExclusions(B) returns only global + B-owned (no A-scoped, no duplicates)', async () => {
    const result = await service.getExclusions(GROUP_B);
    expect(result.map((e: any) => e.mediaServerId).sort()).toEqual([MOVIE_G]);
  });

  it('contrast: the OLD behaviour (global part = all rows) WOULD leak A into B', async () => {
    // 0.3.x `find({ where: { ruleGroupId: null } })` ignored the key and
    // returned ALL rows. Reproduce that "global part" and show MOVIE_X leaks.
    const oldGlobalPart = await repo.find(); // all exclusions
    const bSpecific = await repo.find({ where: { ruleGroupId: GROUP_B } });
    const oldResult = [...bSpecific, ...oldGlobalPart];
    const cascade = buildExclusionCascadeSets(oldResult as any);
    // Under OLD, MOVIE_X (scoped to A) would be excluded from B too:
    expect(isMediaItemExcluded(cascade, { id: MOVIE_X })).toBe(true);
  });
});
