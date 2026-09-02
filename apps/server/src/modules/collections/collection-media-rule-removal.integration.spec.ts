import { DataSource, EntitySchema } from 'typeorm';
import { createMockLogger } from '../../../test/utils/data';
import { CollectionsService } from './collections.service';
import { CollectionMediaPendingDirection } from './entities/collection_media_rule_removal.entities';

// The marker table as the migration builds it. Mirrored with an EntitySchema
// rather than registering the real entity, whose ManyToOne would drag in the
// whole relation graph - the same reason the exclusion-scoping integration test
// mirrors Exclusion.
const MarkerSchema = new EntitySchema<{
  id: number;
  collectionId: number;
  mediaServerId: string;
  direction: CollectionMediaPendingDirection;
}>({
  name: 'CollectionMediaRuleRemoval',
  tableName: 'collection_media_rule_removal',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    collectionId: { type: 'integer' },
    mediaServerId: { type: 'varchar' },
    direction: { type: 'varchar', default: 'remove' },
  },
  indices: [
    {
      name: 'idx_collection_media_rule_removal',
      unique: true,
      columns: ['collectionId', 'mediaServerId'],
    },
  ],
});

// Real-DB test for CollectionsService.markRuleRemoved.
//
// The marker row is unique on (collectionId, mediaServerId), so writing one for
// an item that already has a marker is a conflict, and only the database decides
// what a conflict does. `.orIgnore()` leaves the existing row untouched, which
// silently keeps a stale direction: an item a rule removed and later matched
// again would still read as 'remove', so an add that timed out would be
// reconciled as a lingering orphan and taken back off the media server - undoing
// a write that had in fact committed.
//
// This drives the real service method against a real SQLite repository, so
// reverting the production upsert to `.orIgnore()` fails it. A mocked repository
// cannot see any of this, and neither can a spec that copies the query chain.
//
// Every other constructor dependency is unused by markRuleRemoved, so they are
// stubbed the way the exclusion-scoping integration test stubs RulesService's.

const COLLECTION_ID = 1;

describe('CollectionsService.markRuleRemoved (real SQLite)', () => {
  let dataSource: DataSource;
  let service: CollectionsService;

  const mark = (
    mediaServerIds: string[],
    direction: CollectionMediaPendingDirection,
  ) => service.markRuleRemoved(COLLECTION_ID, mediaServerIds, direction);

  const markers = () =>
    dataSource
      .getRepository(MarkerSchema)
      .find({ order: { mediaServerId: 'ASC' } });

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: true,
      entities: [MarkerSchema],
    }).initialize();

    service = new CollectionsService(
      {} as any, // collectionRepo
      {} as any, // CollectionMediaRepo
      dataSource.getRepository(MarkerSchema) as any,
      {} as any, // CollectionLogRepo
      {} as any, // ruleGroupRepo
      {} as any, // exclusionRepo
      {} as any, // connection
      {} as any, // mediaServerFactory
      {} as any, // mediaItemEnrichmentService
      {} as any, // settingsDataService
      {} as any, // metadataService
      {} as any, // eventEmitter
      {} as any, // collectionPosterService
      {} as any, // overlayProcessor
      createMockLogger() as any,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('replaces a stale direction instead of keeping it', async () => {
    await mark(['item-1'], 'remove');
    await mark(['item-1'], 'add');

    expect(await markers()).toEqual([
      expect.objectContaining({ mediaServerId: 'item-1', direction: 'add' }),
    ]);
  });

  it('keeps one row per item however often it is marked', async () => {
    await mark(['item-1'], 'remove');
    await mark(['item-1'], 'add');
    await mark(['item-1'], 'remove');

    const all = await markers();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(expect.objectContaining({ direction: 'remove' }));
  });

  it('writes a batch without disturbing unrelated markers', async () => {
    await mark(['item-1'], 'remove');
    await mark(['item-2', 'item-3'], 'add');

    expect(await markers()).toEqual([
      expect.objectContaining({ mediaServerId: 'item-1', direction: 'remove' }),
      expect.objectContaining({ mediaServerId: 'item-2', direction: 'add' }),
      expect.objectContaining({ mediaServerId: 'item-3', direction: 'add' }),
    ]);
  });

  it('defaults to a removal when no direction is given', async () => {
    await service.markRuleRemoved(COLLECTION_ID, ['item-1']);

    expect(await markers()).toEqual([
      expect.objectContaining({ direction: 'remove' }),
    ]);
  });
});
