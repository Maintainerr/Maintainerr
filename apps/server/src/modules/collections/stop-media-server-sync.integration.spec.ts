import { DataSource, EntitySchema } from 'typeorm';
import { createMockLogger } from '../../../test/utils/data';
import { CollectionsService } from './collections.service';

// Only the two tables the unlink touches, mirrored rather than registered for
// the same reason the marker test mirrors its own: the real Collection drags in
// the whole relation graph.
const CollectionSchema = new EntitySchema<{
  id: number;
  title: string;
  mediaServerId: string | null;
}>({
  name: 'Collection',
  tableName: 'collection',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    title: { type: 'varchar' },
    mediaServerId: { type: 'varchar', nullable: true },
  },
});

const MarkerSchema = new EntitySchema<{
  id: number;
  collectionId: number;
  mediaServerId: string;
}>({
  name: 'CollectionMediaRuleRemoval',
  tableName: 'collection_media_rule_removal',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    collectionId: { type: 'integer' },
    mediaServerId: { type: 'varchar' },
  },
});

// Real-DB test for the unlink in CollectionsService.stopMediaServerSync.
//
// Clearing the link and dropping the rule-removal markers has to be one commit.
// Unlinking alone strands the markers for good - every later call returns early
// once mediaServerId is gone - and they are then applied to whatever collection
// a re-link creates, taking a user's hand-added item back out.
//
// Only a database shows a rollback. A mocked repository records the save whether
// or not the transaction commits, so it cannot tell this apart from the
// sequential save-then-delete it replaced.
describe('CollectionsService.stopMediaServerSync (real SQLite)', () => {
  let dataSource: DataSource;
  let service: CollectionsService;

  const seed = async () => {
    const collection = await dataSource
      .getRepository(CollectionSchema)
      .save({ title: 'a collection', mediaServerId: 'remote-1' });

    await dataSource
      .getRepository(MarkerSchema)
      .save({ collectionId: collection.id, mediaServerId: 'item-1' });

    return collection;
  };

  const reread = (id: number) =>
    dataSource.getRepository(CollectionSchema).findOne({ where: { id } });

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: true,
      entities: [CollectionSchema, MarkerSchema],
    }).initialize();

    service = new CollectionsService(
      dataSource.getRepository(CollectionSchema) as any,
      {} as any, // CollectionMediaRepo
      dataSource.getRepository(MarkerSchema) as any,
      {} as any, // CollectionLogRepo
      {} as any, // ruleGroupRepo
      {} as any, // exclusionRepo
      dataSource,
      {} as any, // mediaServerFactory
      {} as any, // mediaItemEnrichmentService
      {} as any, // settingsDataService
      {} as any, // metadataService
      { emit: jest.fn() } as any,
      {} as any, // collectionPosterService
      {} as any, // overlayProcessor
      createMockLogger() as any,
    );

    // The media server teardown owns its coverage in the service spec; this is
    // about what the database is left holding once it succeeds.
    jest
      .spyOn(service as any, 'deleteMediaServerCollection')
      .mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('clears the link and the markers together', async () => {
    const collection = await seed();

    await service.stopMediaServerSync(collection as any);

    expect((await reread(collection.id))?.mediaServerId).toBeNull();
    expect(await dataSource.getRepository(MarkerSchema).find()).toEqual([]);
  });

  it('keeps the link when the marker delete fails', async () => {
    const collection = await seed();

    // Fail the second half from inside the transaction, the way a locked or
    // broken database would.
    await dataSource.query('DROP TABLE collection_media_rule_removal');

    await expect(
      service.stopMediaServerSync(collection as any),
    ).rejects.toThrow();

    // Sequentially this has already committed, and nothing clears the markers
    // again once the link is gone.
    expect((await reread(collection.id))?.mediaServerId).toBe('remote-1');
  });
});
