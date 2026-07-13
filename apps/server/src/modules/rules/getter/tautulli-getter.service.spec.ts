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
import { RulesDto } from '../dtos/rules.dto';
import { TautulliGetterService } from './tautulli-getter.service';

const SW_LAST_WATCHED = 7;

// Tautulli grades watched_status as 0 | 0.25 | 0.5 | 0.75 | 1; only 1 means the
// item crossed the configured watched percent.
const historyItem = (props: {
  watched_status: number;
  percent_complete: number;
  parent_media_index: number;
  media_index: number;
  stopped: number;
}) => ({ user_id: 1, user: 'user', rating_key: 1, ...props });

const createService = (
  history: ReturnType<typeof historyItem>[],
  tautulliWatchedPercentOverride: number | null = null,
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
    {} as jest.Mocked<PlexApiService>,
    collectionRepository,
    createMockLogger(),
  );
};

const showItem: MediaItem = createMediaItem({ type: 'show', id: '1' });
const ruleGroup = { collection: { id: 1 } } as RulesDto;

describe('TautulliGetterService', () => {
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
});
