import { Mocked } from '@suites/doubles.jest';
import { TestBed } from '@suites/unit';
import {
  createCollection,
  createRadarrMovie,
  createSonarrSeries,
} from '../../../test/utils/data';
import { mockRadarrApi, mockSonarrApi } from '../../../test/utils/servarr-mock';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import { SettingsDataService } from '../settings/settings-data.service';
import { ServarrTagService } from './servarr-tag.service';

describe('ServarrTagService', () => {
  let service: ServarrTagService;
  let servarrService: Mocked<ServarrService>;
  let metadataService: Mocked<MetadataService>;
  let settings: Mocked<SettingsDataService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(ServarrTagService).compile();

    service = unit;
    servarrService = unitRef.get(ServarrService);
    metadataService = unitRef.get(MetadataService);
    settings = unitRef.get(SettingsDataService);
    logger = unitRef.get(MaintainerrLogger);

    // By default every media-server id resolves to a tmdb/tvdb candidate; the
    // *arr lookup (mocked per test) decides whether it matches an entity. The
    // candidate id is irrelevant here - the lookup mock ignores it.
    metadataService.resolveLookupCandidatesForService.mockImplementation(
      async (_mediaServerId, service) => [
        { providerKey: service === 'radarr' ? 'tmdb' : 'tvdb', id: 100 },
      ],
    );
  });

  describe('Behavior A - membership tagging', () => {
    it('tags newly added movies in Radarr with the collection title', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 10 }));
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(5);

      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
        title: 'My Group',
      });

      await service.syncMembershipTags(
        collection,
        [{ mediaServerId: 'movie-1' }],
        [],
      );

      // The group name is normalized to the *arr tag charset (^[a-z0-9-]+$).
      expect(radarr.ensureTag).toHaveBeenCalledWith('my-group');
      expect(radarr.setMovieTags).toHaveBeenCalledWith([10], 5, 'add');
      // Never the 'replace' apply mode (would wipe the user's other tags).
      expect(radarr.setMovieTags).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'replace',
      );
    });

    it('uses the current (renamed) group name as the tag - no stale old-label removal', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 10 }));
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(5);

      const renamed = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
        title: 'Renamed Group',
      });

      await service.syncMembershipTags(
        renamed,
        [{ mediaServerId: 'movie-1' }],
        [],
      );

      // Only the current name is ensured/applied; the old (renamed-from) label is
      // intentionally not chased here (documented edge case - re-tagged on churn).
      expect(radarr.ensureTag).toHaveBeenCalledTimes(1);
      expect(radarr.ensureTag).toHaveBeenCalledWith('renamed-group');
      expect(radarr.setMovieTags).toHaveBeenCalledWith([10], 5, 'add');
      expect(radarr.setMovieTags).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'remove',
      );
    });

    it('two groups whose names normalize to the same label share one tag id', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 10 }));
      // ensureTag is idempotent server-side: a given label always yields the same id.
      const ensureTag = jest.spyOn(radarr, 'ensureTag').mockResolvedValue(5);

      const groupA = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
        title: 'My Group',
      });
      const groupB = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
        title: 'My  Group!',
      });

      await service.syncMembershipTags(
        groupA,
        [{ mediaServerId: 'movie-1' }],
        [],
      );
      await service.syncMembershipTags(
        groupB,
        [{ mediaServerId: 'movie-1' }],
        [],
      );

      // Both titles normalize to 'my-group', so both resolve to the same tag id -
      // an untag from one then a re-add from the other converges on the same tag.
      expect(ensureTag.mock.calls.every((c) => c[0] === 'my-group')).toBe(true);
      expect(radarr.setMovieTags).toHaveBeenCalledWith([10], 5, 'add');
    });

    it('normalizes a messy group name to the *arr tag charset', async () => {
      // *arr rejects labels outside ^[a-z0-9-]+$; spaces, case and punctuation
      // collapse to single hyphens.
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 12 }));
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(9);

      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
        title: '  Stale & Old: Movies (2020)!  ',
      });

      await service.syncMembershipTags(
        collection,
        [{ mediaServerId: 'movie-1' }],
        [],
      );

      expect(radarr.ensureTag).toHaveBeenCalledWith('stale-old-movies-2020');
    });

    it('skips tagging when the group name has no taggable characters', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
        title: '★ ☆ !!!',
      });

      await service.syncMembershipTags(
        collection,
        [{ mediaServerId: 'movie-1' }],
        [],
      );

      expect(radarr.ensureTag).not.toHaveBeenCalled();
      expect(radarr.setMovieTags).not.toHaveBeenCalled();
    });

    it('untags removed movies in Radarr', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 11 }));
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(5);

      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
      });

      await service.syncMembershipTags(
        collection,
        [],
        [{ mediaServerId: 'movie-1' }],
      );

      expect(radarr.setMovieTags).toHaveBeenCalledWith([11], 5, 'remove');
    });

    it('tags added shows in Sonarr', async () => {
      const sonarr = mockSonarrApi(servarrService, logger);
      jest
        .spyOn(sonarr, 'getSeriesByTvdbId')
        .mockResolvedValue(createSonarrSeries({ id: 20 }));
      jest.spyOn(sonarr, 'ensureTag').mockResolvedValue(7);

      const collection = createCollection({
        type: 'show',
        sonarrSettingsId: 2,
        tagInArr: true,
        title: 'Show Group',
      });

      await service.syncMembershipTags(
        collection,
        [{ mediaServerId: 'show-3' }],
        [],
      );

      expect(sonarr.ensureTag).toHaveBeenCalledWith('show-group');
      expect(sonarr.setSeriesTags).toHaveBeenCalledWith([20], 7, 'add');
    });

    it('does nothing when the collection has not opted in', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: false,
      });

      await service.syncMembershipTags(
        collection,
        [{ mediaServerId: 'movie-1' }],
        [{ mediaServerId: 'movie-2' }],
      );

      expect(radarr.ensureTag).not.toHaveBeenCalled();
      expect(radarr.setMovieTags).not.toHaveBeenCalled();
    });

    it('skips untaggable types (season/episode) - Sonarr has no per-season tag', async () => {
      const sonarr = mockSonarrApi(servarrService, logger);
      const collection = createCollection({
        type: 'season',
        sonarrSettingsId: 2,
        tagInArr: true,
      });

      await service.syncMembershipTags(
        collection,
        [{ mediaServerId: 'season-1' }],
        [],
      );

      expect(sonarr.ensureTag).not.toHaveBeenCalled();
      expect(sonarr.setSeriesTags).not.toHaveBeenCalled();
    });

    it('skips when no matching *arr instance is selected', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: undefined,
        tagInArr: true,
      });

      await service.syncMembershipTags(
        collection,
        [{ mediaServerId: 'movie-1' }],
        [],
      );

      expect(radarr.ensureTag).not.toHaveBeenCalled();
    });

    it('does not untag on a transient lookup failure (undefined), retried next run', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      // undefined = transient (transport/auth/5xx), per the #3125 contract.
      jest.spyOn(radarr, 'getMovieByTmdbId').mockResolvedValue(undefined);
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(5);

      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
      });

      await service.syncMembershipTags(
        collection,
        [],
        [{ mediaServerId: 'movie-1' }],
      );

      expect(radarr.setMovieTags).not.toHaveBeenCalled();
    });

    it('is best-effort: swallows errors and never throws', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'ensureTag')
        .mockRejectedValue(new Error('radarr down'));

      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
      });

      await expect(
        service.syncMembershipTags(
          collection,
          [{ mediaServerId: 'movie-1' }],
          [],
        ),
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('does not error the run when the editor write fails (e.g. a stale id)', async () => {
      // A movie deleted from Radarr between resolve and write makes the editor
      // PUT fail; runPut returns false (never throws), so the run must complete.
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 42 }));
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(5);
      jest.spyOn(radarr, 'setMovieTags').mockResolvedValue(false);

      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
      });

      await expect(
        service.syncMembershipTags(
          collection,
          [{ mediaServerId: 'movie-1' }],
          [],
        ),
      ).resolves.toBeUndefined();
    });

    it('stays consistent at scale: tags 100k added items in bounded editor batches', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(5);
      // Lightweight resolution: media-server id N → tmdb candidate N → movie N.
      metadataService.resolveLookupCandidatesForService.mockImplementation(
        async (mediaServerId) => [
          { providerKey: 'tmdb', id: Number(mediaServerId) },
        ],
      );
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockImplementation(async (id) => ({ id }) as never);
      const setMovieTags = jest.spyOn(radarr, 'setMovieTags');

      const total = 100_000;
      const added = Array.from({ length: total }, (_, i) => ({
        mediaServerId: String(i + 1),
      }));

      const collection = createCollection({
        type: 'movie',
        radarrSettingsId: 1,
        tagInArr: true,
        title: 'Huge Collection',
      });

      await service.syncMembershipTags(collection, added, []);

      // Every distinct item is tagged exactly once - nothing dropped or doubled.
      const addCalls = setMovieTags.mock.calls.filter((c) => c[2] === 'add');
      const taggedIds = addCalls.flatMap((c) => c[0]);
      expect(taggedIds).toHaveLength(total);
      expect(new Set(taggedIds).size).toBe(total);

      // Writes are chunked so a huge delta never builds an unbounded request.
      expect(addCalls).toHaveLength(total / 100); // EDITOR_BATCH_SIZE = 100
      for (const call of addCalls) {
        expect(call[0].length).toBeLessThanOrEqual(100);
        expect(call[1]).toBe(5); // the tag id
      }
    }, 30_000);
  });

  describe('Behavior B - exclusion tagging', () => {
    const movieTarget = { mediaServerId: 'movie-1', type: 'movie' as const };

    it('does nothing when exclusion tagging is disabled', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      settings.radarr_tag_exclusions = false;

      await service.applyExclusionTag(movieTarget, { radarrSettingsId: 1 });

      expect(radarr.ensureTag).not.toHaveBeenCalled();
    });

    it('applies the configured tag on exclude when enabled', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 30 }));
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(9);
      settings.radarr_tag_exclusions = true;
      settings.radarr_exclusion_tag = 'dnd';

      await service.applyExclusionTag(movieTarget, { radarrSettingsId: 1 });

      expect(radarr.ensureTag).toHaveBeenCalledWith('dnd');
      expect(radarr.setMovieTags).toHaveBeenCalledWith([30], 9, 'add');
    });

    it('does not remove the tag on un-exclude unless opted in (conservative default)', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      settings.radarr_tag_exclusions = true;
      settings.radarr_exclusion_tag = 'dnd';
      settings.radarr_untag_on_unexclude = false;

      await service.removeExclusionTag(movieTarget, { radarrSettingsId: 1 });

      expect(radarr.ensureTag).not.toHaveBeenCalled();
      expect(radarr.setMovieTags).not.toHaveBeenCalled();
    });

    it('removes only the configured tag on un-exclude when opted in', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      jest
        .spyOn(radarr, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 31 }));
      jest.spyOn(radarr, 'ensureTag').mockResolvedValue(9);
      settings.radarr_tag_exclusions = true;
      settings.radarr_exclusion_tag = 'dnd';
      settings.radarr_untag_on_unexclude = true;

      await service.removeExclusionTag(movieTarget, { radarrSettingsId: 1 });

      expect(radarr.setMovieTags).toHaveBeenCalledWith([31], 9, 'remove');
    });

    it('skips when no *arr instance is associated (e.g. a global exclusion)', async () => {
      const radarr = mockRadarrApi(servarrService, logger);
      settings.radarr_tag_exclusions = true;
      settings.radarr_exclusion_tag = 'dnd';

      await service.applyExclusionTag(movieTarget, {
        radarrSettingsId: null,
        sonarrSettingsId: null,
      });

      expect(radarr.ensureTag).not.toHaveBeenCalled();
    });
  });
});
