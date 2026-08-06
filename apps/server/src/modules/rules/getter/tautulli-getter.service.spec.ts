import { MediaItem } from '@maintainerr/contracts';
import { Repository } from 'typeorm';
import {
  createCollection,
  createMediaItem,
  createMockLogger,
} from '../../../../test/utils/data';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { TautulliApiService } from '../../api/tautulli-api/tautulli-api.service';
import { Collection } from '../../collections/entities/collection.entities';
import { RuleGroupDto } from '../dtos/ruleGroup.dto';
import { TautulliGetterService } from './tautulli-getter.service';

const SEEN_BY = 0;
const SW_LAST_WATCHED = 7;
const VIEW_COUNT_BY_USER = 9;
const WATCH_TIME_BY_USER = 10;
const LAST_VIEWED_AT_BY_USER = 11;

// Tautulli grades watched_status as 0 | 0.25 | 0.5 | 0.75 | 1; only 1 means the
// item crossed the configured watched percent.
const historyItem = (props: {
  watched_status: number;
  percent_complete: number;
  parent_media_index: number;
  media_index: number;
  stopped: number;
}) => ({
  user_id: 1,
  user: 'user',
  rating_key: 1,
  play_duration: 0,
  ...props,
});

const createService = (
  history: ReturnType<typeof historyItem>[],
  tautulliWatchedPercentOverride: number | null = null,
  plexApi: Partial<jest.Mocked<PlexApiService>> = {},
) => {
  const tautulliApi = {
    getMetadata: jest
      .fn()
      .mockResolvedValue({ media_type: 'show', rating_key: '1' }),
    getHistory: jest.fn().mockResolvedValue(history),
  } as unknown as jest.Mocked<TautulliApiService>;

  const collectionRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(createCollection({ tautulliWatchedPercentOverride })),
  } as unknown as jest.Mocked<Repository<Collection>>;

  return new TautulliGetterService(
    tautulliApi,
    plexApi as jest.Mocked<PlexApiService>,
    collectionRepository,
    createMockLogger(),
  );
};

const showItem: MediaItem = createMediaItem({ type: 'show', id: '1' });
const ruleGroup = { collection: { id: 1 } } as RuleGroupDto;

describe('TautulliGetterService', () => {
  describe('seenBy', () => {
    const watchedPlay = historyItem({
      watched_status: 1,
      percent_complete: 100,
      parent_media_index: 1,
      media_index: 1,
      stopped: 1_700_000_000,
    });

    it('maps Tautulli viewer ids to plex.tv usernames', async () => {
      const service = createService([watchedPlay], null, {
        getCorrectedUsers: jest
          .fn()
          .mockResolvedValue([{ plexId: 1, username: 'alice' }]),
      } as Partial<jest.Mocked<PlexApiService>>);

      await expect(
        service.get(SEEN_BY, showItem, undefined, ruleGroup),
      ).resolves.toEqual(['alice']);
    });

    it('returns undefined when the plex.tv username enrichment fails so degraded names never mis-evaluate rules (#3307)', async () => {
      // Before, a failed plex.tv fetch degraded to local account ids/names,
      // silently dropping viewers from the list.
      const service = createService([watchedPlay], null, {
        getCorrectedUsers: jest
          .fn()
          .mockRejectedValue(new Error('plex.tv user data unavailable')),
      } as Partial<jest.Mocked<PlexApiService>>);

      await expect(
        service.get(SEEN_BY, showItem, undefined, ruleGroup),
      ).resolves.toBeUndefined();
    });
  });

  describe('sw_lastWatched', () => {
    it('returns null when no episode crossed the watched threshold', async () => {
      const service = createService([
        historyItem({
          watched_status: 0.25,
          percent_complete: 30,
          parent_media_index: 1,
          media_index: 1,
          stopped: 1_700_000_000,
        }),
      ]);

      await expect(
        service.get(SW_LAST_WATCHED, showItem, undefined, ruleGroup),
      ).resolves.toBeNull();
    });

    it('ignores episodes below the watched threshold', async () => {
      // Tautulli returns history newest-first, so the unwatched season 2 play
      // leads. Only the season 1 play crossed the threshold.
      const service = createService([
        historyItem({
          watched_status: 0.75,
          percent_complete: 80,
          parent_media_index: 2,
          media_index: 1,
          stopped: 1_700_000_500,
        }),
        historyItem({
          watched_status: 1,
          percent_complete: 100,
          parent_media_index: 1,
          media_index: 1,
          stopped: 1_700_000_000,
        }),
      ]);

      await expect(
        service.get(SW_LAST_WATCHED, showItem, undefined, ruleGroup),
      ).resolves.toEqual(new Date(1_700_000_000 * 1000));
    });

    it('returns the newest watched episode of the newest watched season', async () => {
      // The season 1 rewatch is the most recent play, but season 2 is the
      // newest season - the result must come from there, not from history order.
      const service = createService([
        historyItem({
          watched_status: 1,
          percent_complete: 100,
          parent_media_index: 1,
          media_index: 9,
          stopped: 1_700_000_900,
        }),
        historyItem({
          watched_status: 1,
          percent_complete: 100,
          parent_media_index: 2,
          media_index: 1,
          stopped: 1_700_000_100,
        }),
        historyItem({
          watched_status: 1,
          percent_complete: 100,
          parent_media_index: 2,
          media_index: 2,
          stopped: 1_700_000_200,
        }),
      ]);

      await expect(
        service.get(SW_LAST_WATCHED, showItem, undefined, ruleGroup),
      ).resolves.toEqual(new Date(1_700_000_200 * 1000));
    });

    it('counts any play above the collection percent override as watched', async () => {
      const service = createService(
        [
          historyItem({
            watched_status: 0.25,
            percent_complete: 30,
            parent_media_index: 1,
            media_index: 1,
            stopped: 1_700_000_000,
          }),
        ],
        20,
      );

      await expect(
        service.get(SW_LAST_WATCHED, showItem, undefined, ruleGroup),
      ).resolves.toEqual(new Date(1_700_000_000 * 1000));
    });
  });

  describe('per-user properties', () => {
    const rule = { username: 'alice' } as never;
    const correctedUsers = {
      getCorrectedUsers: jest.fn().mockResolvedValue([
        { plexId: 1, username: 'alice' },
        { plexId: 2, username: 'bob' },
      ]),
    };
    const play = (
      user_id: number,
      watched_status: number,
      play_duration: number,
      stopped: number,
    ) => ({
      ...historyItem({
        watched_status,
        percent_complete: watched_status === 1 ? 100 : 30,
        parent_media_index: 1,
        media_index: 1,
        stopped,
      }),
      user_id,
      play_duration,
    });

    const history = [
      play(1, 1, 1800, 1_700_000_000),
      play(1, 0.25, 900, 1_700_000_500),
      play(2, 1, 3600, 1_700_100_000),
    ];

    it('counts only the picked user, and only their watched plays', async () => {
      const service = createService(history, null, correctedUsers);

      await expect(
        service.get(VIEW_COUNT_BY_USER, showItem, undefined, ruleGroup, rule),
      ).resolves.toBe(1);
      await expect(
        service.get(
          LAST_VIEWED_AT_BY_USER,
          showItem,
          undefined,
          ruleGroup,
          rule,
        ),
      ).resolves.toEqual(new Date(1_700_000_000 * 1000));
    });

    // Tautulli only renamed `duration` to `play_duration` in 2.12.3, so an
    // older install answers with the original key alone.
    it('reads the watch time of a Tautulli older than 2.12.3', async () => {
      const legacyHistory = history.map(({ play_duration, ...row }) => ({
        ...row,
        duration: play_duration,
      }));
      const service = createService(
        legacyHistory as never,
        null,
        correctedUsers,
      );

      await expect(
        service.get(WATCH_TIME_BY_USER, showItem, undefined, ruleGroup, rule),
      ).resolves.toBe(45);
    });

    it('sums every play of the picked user, in minutes', async () => {
      const service = createService(history, null, correctedUsers);

      await expect(
        service.get(WATCH_TIME_BY_USER, showItem, undefined, ruleGroup, rule),
      ).resolves.toBe(45);
    });

    it('honours the collection watched-percent override for the view count', async () => {
      const service = createService(history, 20, correctedUsers);

      await expect(
        service.get(VIEW_COUNT_BY_USER, showItem, undefined, ruleGroup, rule),
      ).resolves.toBe(2);
    });

    // Zero here would read as "this user never watched it" and let a rule that
    // protects rewatched media sweep it instead.
    it.each([
      {
        when: 'the rule has no user',
        ruleDto: {} as never,
        plexApi: correctedUsers,
      },
      {
        when: 'Plex no longer has the user',
        ruleDto: rule,
        plexApi: { getCorrectedUsers: jest.fn().mockResolvedValue([]) },
      },
      {
        when: 'plex.tv could not be reached',
        ruleDto: rule,
        plexApi: {
          getCorrectedUsers: jest
            .fn()
            .mockRejectedValue(new Error('plex.tv user data unavailable')),
        },
      },
    ])('skips the item when $when', async ({ ruleDto, plexApi }) => {
      const service = createService(history, null, plexApi);

      await expect(
        service.get(
          VIEW_COUNT_BY_USER,
          showItem,
          undefined,
          ruleGroup,
          ruleDto,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('when Tautulli cannot answer', () => {
    const serviceWith = (tautulliApi: Partial<TautulliApiService>) =>
      new TautulliGetterService(
        tautulliApi as jest.Mocked<TautulliApiService>,
        {} as jest.Mocked<PlexApiService>,
        {
          findOne: jest.fn().mockResolvedValue(createCollection({})),
        } as unknown as jest.Mocked<Repository<Collection>>,
        createMockLogger(),
      );

    // Reading through the null threw, which surfaced as the same transient
    // signal behind a misleading "Action failed" warning.
    it('stays transient when Tautulli returns no metadata', async () => {
      const service = serviceWith({
        getMetadata: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.get(SEEN_BY, showItem, undefined, ruleGroup),
      ).resolves.toBeUndefined();
    });
  });
});
