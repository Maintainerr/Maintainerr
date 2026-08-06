import { MediaItem } from '@maintainerr/contracts';
import {
  batchIdsByRequestCost,
  readMetadataInBatches,
} from './metadata-batch.util';

const item = (id: string): MediaItem =>
  ({
    id,
    title: id,
    guid: `${id}-guid`,
    type: 'movie',
    addedAt: new Date(),
    providerIds: {},
    mediaSources: [],
    library: { id: 'library-1', title: 'Movies' },
  }) satisfies MediaItem;

const ids = (count: number, length = 4) =>
  Array.from({ length: count }, (unused, index) =>
    `${index}`.padStart(length, 'i'),
  );

describe('batchIdsByRequestCost', () => {
  it('fills a request up to its budget and no further', () => {
    // 32-character ids costing 5 more each is Jellyfin's shape: 108 fit in 4000.
    const batches = batchIdsByRequestCost(ids(109, 32), 5);

    expect(batches.map((batch) => batch.length)).toEqual([108, 1]);
  });

  // Longer ids mean fewer per request without anyone choosing a number.
  it('reads fewer per request when the ids are longer', () => {
    const short = batchIdsByRequestCost(ids(500, 4), 1);
    const long = batchIdsByRequestCost(ids(500, 40), 1);

    expect(short[0].length).toBeGreaterThan(long[0].length);
  });

  it('still asks for an id that is over budget on its own', () => {
    expect(batchIdsByRequestCost(['x'.repeat(9000)], 1)).toEqual([
      ['x'.repeat(9000)],
    ]);
  });

  it('has nothing to read for no ids', () => {
    expect(batchIdsByRequestCost([], 1)).toEqual([]);
  });
});

describe('readMetadataInBatches', () => {
  it('reads a short list in one request', async () => {
    const readBatch = jest.fn(async (batch: string[]) => batch.map(item));

    const items = await readMetadataInBatches({
      itemIds: ['a', 'b'],
      perIdCost: 1,
      readBatch,
    });

    expect(readBatch).toHaveBeenCalledTimes(1);
    expect(readBatch).toHaveBeenCalledWith(['a', 'b']);
    expect(items.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('asks for an id once even when a caller repeats it', async () => {
    const readBatch = jest.fn(async (batch: string[]) => batch.map(item));

    await readMetadataInBatches({
      itemIds: ['a', 'a', 'b'],
      perIdCost: 1,
      readBatch,
    });

    expect(readBatch).toHaveBeenCalledWith(['a', 'b']);
  });

  // Jellyfin answers an unfiltered listing when it cannot parse the ids filter.
  it('keeps only the ids it asked for', async () => {
    const items = await readMetadataInBatches({
      itemIds: ['a'],
      perIdCost: 1,
      readBatch: async () => [item('a'), item('somebody-else')],
    });

    expect(items.map((entry) => entry.id)).toEqual(['a']);
  });

  it('serves a cached id without reading it, and caches what it reads', async () => {
    const cached = item('a');
    const set = jest.fn();
    const readBatch = jest.fn(async (batch: string[]) => batch.map(item));

    const items = await readMetadataInBatches({
      itemIds: ['a', 'b'],
      perIdCost: 1,
      readBatch,
      cache: { get: (id) => (id === 'a' ? cached : undefined), set },
    });

    expect(readBatch).toHaveBeenCalledWith(['b']);
    expect(items.map((entry) => entry.id).sort()).toEqual(['a', 'b']);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('makes no request when every id is cached', async () => {
    const readBatch = jest.fn();

    await readMetadataInBatches({
      itemIds: ['a'],
      perIdCost: 1,
      readBatch,
      cache: { get: () => item('a'), set: jest.fn() },
    });

    expect(readBatch).not.toHaveBeenCalled();
  });

  // A failed read leaves its ids out rather than reporting them as missing, and
  // must not abandon the batches after it.
  it('reports a failed batch and keeps reading the rest', async () => {
    const onBatchError = jest.fn();
    const longIds = ids(200, 32);
    const readBatch = jest.fn(async (batch: string[]) => {
      if (batch.includes(longIds[0])) throw new Error('boom');
      return batch.map(item);
    });

    const items = await readMetadataInBatches({
      itemIds: longIds,
      perIdCost: 5,
      readBatch,
      onBatchError,
    });

    expect(readBatch.mock.calls.length).toBeGreaterThan(1);
    expect(onBatchError).toHaveBeenCalledTimes(1);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(longIds.length);
  });
});
