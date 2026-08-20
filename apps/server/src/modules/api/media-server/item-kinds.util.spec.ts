import { onlyRequestedItemKinds } from './item-kinds.util';

describe('onlyRequestedItemKinds', () => {
  const movie = { Id: 'm1', Type: 'Movie' };
  const boxSet = { Id: 'b1', Type: 'BoxSet' };
  const untyped: { Id: string; Type?: string } = { Id: 'u1' };

  it('keeps only requested kinds, from an array or an Emby type string', () => {
    expect(onlyRequestedItemKinds([movie, boxSet], ['Movie'])).toEqual([movie]);
    expect(onlyRequestedItemKinds([movie, boxSet], 'Movie,Series')).toEqual([
      movie,
    ]);
  });

  it('tolerates a missing list and rows without a Type', () => {
    expect(onlyRequestedItemKinds(undefined, ['Movie'])).toEqual([]);
    expect(onlyRequestedItemKinds([untyped], ['Movie'])).toEqual([]);
  });
});
