import { DataSource, EntitySchema } from 'typeorm';
import { CollectionMediaPendingDirection } from './entities/collection_media_rule_removal.entities';

// Real-DB test for the marker upsert in CollectionsService.markRuleRemoved.
//
// The row is unique on (collectionId, mediaServerId), so writing a marker for an
// item that already has one is a conflict. `.orIgnore()` leaves the existing row
// untouched, which silently keeps a stale direction: an item a rule removed and
// later matched again would still read as 'remove', so an add that timed out
// would be reconciled as a lingering orphan and taken back off the media server -
// undoing a write that had in fact committed.
//
// Mocked repositories cannot see that; only the database decides what a conflict
// does. This mirrors the entity with an EntitySchema, as the exclusion-scoping
// integration test does, to avoid decorator metadata setup.

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

describe('rule-removal marker upsert', () => {
  let dataSource: DataSource;

  // The exact chain markRuleRemoved uses.
  const mark = (
    mediaServerIds: string[],
    direction: CollectionMediaPendingDirection,
  ) =>
    dataSource
      .getRepository(MarkerSchema)
      .createQueryBuilder()
      .insert()
      .into(MarkerSchema)
      .values(
        mediaServerIds.map((mediaServerId) => ({
          collectionId: 1,
          mediaServerId,
          direction,
        })),
      )
      .orUpdate(['direction'], ['collectionId', 'mediaServerId'])
      .execute();

  const rows = () =>
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
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('replaces a stale direction instead of keeping it', async () => {
    await mark(['item-1'], 'remove');
    await mark(['item-1'], 'add');

    expect(await rows()).toEqual([
      expect.objectContaining({ mediaServerId: 'item-1', direction: 'add' }),
    ]);
  });

  it('keeps one row per item however often it is marked', async () => {
    await mark(['item-1'], 'remove');
    await mark(['item-1'], 'add');
    await mark(['item-1'], 'remove');

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(expect.objectContaining({ direction: 'remove' }));
  });

  it('writes a batch without disturbing unrelated markers', async () => {
    await mark(['item-1'], 'remove');
    await mark(['item-2', 'item-3'], 'add');

    expect(await rows()).toEqual([
      expect.objectContaining({ mediaServerId: 'item-1', direction: 'remove' }),
      expect.objectContaining({ mediaServerId: 'item-2', direction: 'add' }),
      expect.objectContaining({ mediaServerId: 'item-3', direction: 'add' }),
    ]);
  });
});
