import {
  buildExclusionCascadeSets,
  isMediaItemExcluded,
} from './exclusion-cascade.helper';

const EPISODE_ID = 'ep-1';
const SIBLING_EPISODE_ID = 'ep-2';
const SEASON_ID = 'season-1';
const SIBLING_SEASON_ID = 'season-2';
const SHOW_ID = 'show-1';
const OTHER_SHOW_ID = 'show-2';

describe('exclusion-cascade.helper', () => {
  describe('isMediaItemExcluded', () => {
    it('returns false for sibling episodes when only one episode is excluded (issue #2858)', () => {
      const sets = buildExclusionCascadeSets([
        { mediaServerId: EPISODE_ID, type: 'episode' },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(
        isMediaItemExcluded(sets, {
          id: EPISODE_ID,
          parentId: SEASON_ID,
          grandparentId: SHOW_ID,
        }),
      ).toBe(true);

      expect(
        isMediaItemExcluded(sets, {
          id: SIBLING_EPISODE_ID,
          parentId: SEASON_ID,
          grandparentId: SHOW_ID,
        }),
      ).toBe(false);
    });

    it('cascades a season exclusion to its episodes only', () => {
      const sets = buildExclusionCascadeSets([
        { mediaServerId: SEASON_ID, type: 'season' },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(
        isMediaItemExcluded(sets, {
          id: EPISODE_ID,
          parentId: SEASON_ID,
          grandparentId: SHOW_ID,
        }),
      ).toBe(true);

      // Episode in a different season of the same show is not affected.
      expect(
        isMediaItemExcluded(sets, {
          id: SIBLING_EPISODE_ID,
          parentId: SIBLING_SEASON_ID,
          grandparentId: SHOW_ID,
        }),
      ).toBe(false);
    });

    it('cascades a show exclusion to its seasons and episodes', () => {
      const sets = buildExclusionCascadeSets([
        { mediaServerId: SHOW_ID, type: 'show' },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(
        isMediaItemExcluded(sets, {
          id: SEASON_ID,
          parentId: SHOW_ID,
        }),
      ).toBe(true);

      expect(
        isMediaItemExcluded(sets, {
          id: EPISODE_ID,
          parentId: SEASON_ID,
          grandparentId: SHOW_ID,
        }),
      ).toBe(true);

      // Other show's content is unaffected.
      expect(
        isMediaItemExcluded(sets, {
          id: 'season-other',
          parentId: OTHER_SHOW_ID,
        }),
      ).toBe(false);
    });

    it('keeps cascading legacy null-type exclusions via the parent fallback', () => {
      const sets = buildExclusionCascadeSets([
        { mediaServerId: SHOW_ID, parent: SHOW_ID, type: undefined },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(
        isMediaItemExcluded(sets, {
          id: SEASON_ID,
          parentId: SHOW_ID,
        }),
      ).toBe(true);

      expect(
        isMediaItemExcluded(sets, {
          id: EPISODE_ID,
          parentId: SEASON_ID,
          grandparentId: SHOW_ID,
        }),
      ).toBe(true);

      expect(
        isMediaItemExcluded(sets, {
          id: 'season-other',
          parentId: OTHER_SHOW_ID,
        }),
      ).toBe(false);
    });

    it('coerces numeric ids to strings before set lookup', () => {
      const sets = buildExclusionCascadeSets([
        { mediaServerId: '42', type: 'show' },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(
        isMediaItemExcluded(sets, {
          id: 99 as unknown as string,
          parentId: 7 as unknown as string,
          grandparentId: 42 as unknown as string,
        }),
      ).toBe(true);
    });
  });
});
