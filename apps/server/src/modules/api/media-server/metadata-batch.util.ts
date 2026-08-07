import { MediaItem } from '@maintainerr/contracts';

/**
 * Characters a batched id read may spend on its request line.
 *
 * Every server takes the ids in the request line, and the low ceiling belongs to
 * whatever sits in front of it: nginx and Apache both stop at about 8KB by
 * default, and Jellyfin itself answers HTTP 414 past roughly the same (measured
 * on 10.11: 215 ids pass at 8025 characters, 230 fail at 8580). Half of that
 * leaves room for a reverse proxy configured tighter than the default.
 */
const REQUEST_BUDGET_CHARS = 4000;

interface MetadataBatchRead {
  itemIds: string[];
  /**
   * Characters an id costs beyond its own length - the separator or parameter
   * name the server's request shape puts in front of it. Batch sizes follow
   * from this and the ids themselves, so a server with long ids reads fewer per
   * request without anyone picking a number.
   */
  perIdCost: number;
  /** One read for these ids, answering only the items it resolved. */
  readBatch: (itemIds: string[]) => Promise<MediaItem[]>;
  /** Per-item cache, so an id already held is not read again. */
  cache?: {
    get: (itemId: string) => MediaItem | undefined;
    set: (item: MediaItem) => void;
  };
  /** A read that threw. Its ids are simply absent from the result. */
  onBatchError?: (itemIds: string[], error: unknown) => void;
}

/**
 * Split ids into as few reads as each request line allows.
 *
 * Always at least one id per batch: a single id over budget still has to be
 * asked for, and the server is the one to reject it.
 */
export const batchIdsByRequestCost = (
  itemIds: string[],
  perIdCost: number,
): string[][] => {
  const batches: string[][] = [];
  let batch: string[] = [];
  let cost = 0;

  for (const itemId of itemIds) {
    const idCost = itemId.length + perIdCost;

    if (batch.length > 0 && cost + idCost > REQUEST_BUDGET_CHARS) {
      batches.push(batch);
      batch = [];
      cost = 0;
    }

    batch.push(itemId);
    cost += idCost;
  }

  if (batch.length > 0) {
    batches.push(batch);
  }

  return batches;
};

/**
 * Read metadata for many ids, in as few requests as the server allows.
 *
 * Shared by every adapter's `getMetadataBatch`, so they contribute only their
 * own request and mapping: the caching, the batching, keeping the answer to the
 * ids that were asked for, and swallowing a failed read all behave the same
 * whichever server is configured.
 *
 * Only resolved items come back. An id the server did not answer for is absent
 * rather than reported, so this can never be read as evidence an item is gone.
 */
export const readMetadataInBatches = async ({
  itemIds,
  perIdCost,
  readBatch,
  cache,
  onBatchError,
}: MetadataBatchRead): Promise<MediaItem[]> => {
  const items: MediaItem[] = [];
  const toRead: string[] = [];

  for (const itemId of new Set(itemIds)) {
    const cached = cache?.get(itemId);

    if (cached === undefined) {
      toRead.push(itemId);
    } else {
      items.push(cached);
    }
  }

  for (const batch of batchIdsByRequestCost(toRead, perIdCost)) {
    // Jellyfin answers an unfiltered listing when it cannot parse the ids
    // filter, so no server is trusted to answer only what it was asked for.
    const requested = new Set(batch);

    try {
      for (const item of await readBatch(batch)) {
        if (!requested.has(item.id)) continue;

        cache?.set(item);
        items.push(item);
      }
    } catch (error) {
      onBatchError?.(batch, error);
    }
  }

  return items;
};
