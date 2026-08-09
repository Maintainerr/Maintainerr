import { MediaItem } from '@maintainerr/contracts';
import { readItemPresence } from './item-presence.util';
import { IMediaServerService } from './media-server.interface';

const item = (id: string): MediaItem => ({ id, type: 'movie' }) as MediaItem;

const createMediaServer = (overrides: Partial<IMediaServerService> = {}) =>
  ({
    getMetadataBatch: jest.fn().mockResolvedValue([]),
    itemExists: jest.fn().mockResolvedValue(true),
    ...overrides,
  }) as unknown as IMediaServerService;

describe('readItemPresence', () => {
  it('confirms only the ids the batch did not answer for', async () => {
    const mediaServer = createMediaServer({
      getMetadataBatch: jest.fn().mockResolvedValue([item('a'), item('c')]),
      itemExists: jest.fn().mockResolvedValue(false),
    });

    const { found, missing } = await readItemPresence(
      mediaServer,
      ['a', 'b', 'c'],
      jest.fn(),
    );

    expect(mediaServer.getMetadataBatch).toHaveBeenCalledTimes(1);
    expect(mediaServer.itemExists).toHaveBeenCalledTimes(1);
    expect(mediaServer.itemExists).toHaveBeenCalledWith('b');
    expect([...found.keys()]).toEqual(['a', 'c']);
    expect([...missing]).toEqual(['b']);
  });

  it('leaves an id the server still holds out of missing', async () => {
    const mediaServer = createMediaServer({
      itemExists: jest.fn().mockResolvedValue(true),
    });

    const { missing } = await readItemPresence(mediaServer, ['a'], jest.fn());

    expect(missing.size).toBe(0);
  });

  it('reports an inconclusive check without calling the id missing', async () => {
    const onInconclusive = jest.fn();
    const mediaServer = createMediaServer({
      itemExists: jest.fn().mockRejectedValue(new Error('unreachable')),
    });

    const { found, missing } = await readItemPresence(
      mediaServer,
      ['a'],
      onInconclusive,
    );

    expect(found.size).toBe(0);
    expect(missing.size).toBe(0);
    expect(onInconclusive).toHaveBeenCalledTimes(1);
  });

  it('falls back to a check per id when the batch itself fails', async () => {
    const mediaServer = createMediaServer({
      getMetadataBatch: jest.fn().mockRejectedValue(new Error('batch failed')),
      itemExists: jest.fn().mockResolvedValue(false),
    });

    const { missing } = await readItemPresence(
      mediaServer,
      ['a', 'b'],
      jest.fn(),
    );

    expect(mediaServer.itemExists).toHaveBeenCalledTimes(2);
    expect([...missing]).toEqual(['a', 'b']);
  });
});
