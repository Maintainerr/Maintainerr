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
  describe('buildExclusionCascadeSets', () => {
    it('routes exclusions into mediaServerId / show / season buckets by type', () => {
      const sets = buildExclusionCascadeSets([
        { mediaServerId: SHOW_ID, type: 'show' },
        { mediaServerId: SEASON_ID, type: 'season' },
        { mediaServerId: EPISODE_ID, type: 'episode' },
        { mediaServerId: 'movie-1', type: 'movie' },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(sets.excludedMediaServerIds).toEqual(
        new Set([SHOW_ID, SEASON_ID, EPISODE_ID, 'movie-1']),
      );
      expect(sets.excludedShowIds).toEqual(new Set([SHOW_ID]));
      expect(sets.excludedSeasonIds).toEqual(new Set([SEASON_ID]));
      expect(sets.legacyParentIds.size).toBe(0);
    });

    it('ignores exclusions with no mediaServerId', () => {
      const sets = buildExclusionCascadeSets([
        { mediaServerId: undefined, type: 'show' },
        { mediaServerId: '', type: 'season' },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(sets.excludedMediaServerIds.size).toBe(0);
      expect(sets.excludedShowIds.size).toBe(0);
      expect(sets.excludedSeasonIds.size).toBe(0);
      expect(sets.legacyParentIds.size).toBe(0);
    });

    it('falls back to parent-based cascade for legacy null-type rows', () => {
      // Legacy rows produced before exclusion.type was introduced. The
      // ExclusionTypeCorrectorService backfills these on startup, but the
      // backfill is skipped if the media server is unreachable, so we keep
      // the pre-#2858 (loose) cascade until the type lands.
      const sets = buildExclusionCascadeSets([
        { mediaServerId: SHOW_ID, parent: SHOW_ID, type: undefined },
        {
          mediaServerId: SEASON_ID,
          parent: SHOW_ID,
          type: null as unknown as undefined,
        },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(sets.excludedMediaServerIds).toEqual(
        new Set([SHOW_ID, SEASON_ID]),
      );
      expect(sets.excludedShowIds.size).toBe(0);
      expect(sets.excludedSeasonIds.size).toBe(0);
      expect(sets.legacyParentIds).toEqual(new Set([SHOW_ID]));
    });
  });

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

    it('cascades a legacy null-type episode exclusion to siblings, but stops once its type is backfilled', () => {
      // Trade-off documented in buildExclusionCascadeSets: legacy null-type
      // rows fall back to the pre-#2858 (loose) parent cascade, so a legacy
      // single-episode exclusion still over-skips its siblings. The bug-fix
      // for #2858 only applies once ExclusionTypeCorrectorService has stamped
      // the row with its real type.
      const legacy = buildExclusionCascadeSets([
        { mediaServerId: EPISODE_ID, parent: SHOW_ID, type: undefined },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(
        isMediaItemExcluded(legacy, {
          id: SIBLING_EPISODE_ID,
          parentId: SEASON_ID,
          grandparentId: SHOW_ID,
        }),
      ).toBe(true);

      const backfilled = buildExclusionCascadeSets([
        { mediaServerId: EPISODE_ID, parent: SHOW_ID, type: 'episode' },
      ] as Parameters<typeof buildExclusionCascadeSets>[0]);

      expect(
        isMediaItemExcluded(backfilled, {
          id: SIBLING_EPISODE_ID,
          parentId: SEASON_ID,
          grandparentId: SHOW_ID,
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
