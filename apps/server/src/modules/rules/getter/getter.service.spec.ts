import {
  MediaItem,
  MediaServerType,
  RuleValueType,
} from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { Application } from '../constants/rules.constants';
import { RuleGroupDto } from '../dtos/ruleGroup.dto';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { EmbyGetterService } from './emby-getter.service';
import { ValueGetterService } from './getter.service';
import { JellyfinGetterService } from './jellyfin-getter.service';
import { PlexGetterService } from './plex-getter.service';

const item: MediaItem = {
  id: 'item-1',
  title: 'Sample Movie',
  guid: 'media://item-1',
  type: 'movie',
  addedAt: new Date('2024-01-01'),
  providerIds: { tmdb: ['1'] },
  mediaSources: [],
  library: { id: 'library-1', title: 'Movies' },
};

describe('ValueGetterService', () => {
  let service: ValueGetterService;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let plexGetter: Mocked<PlexGetterService>;
  let jellyfinGetter: Mocked<JellyfinGetterService>;
  let embyGetter: Mocked<EmbyGetterService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(ValueGetterService).compile();

    service = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    plexGetter = unitRef.get(PlexGetterService);
    jellyfinGetter = unitRef.get(JellyfinGetterService);
    embyGetter = unitRef.get(EmbyGetterService);
  });

  it.each([
    MediaServerType.PLEX,
    MediaServerType.JELLYFIN,
    MediaServerType.EMBY,
  ])(
    'passes the run cache to the %s media-server getter',
    async (serverType) => {
      const cache = new ArrLookupCache();
      const ruleGroup = { id: 1 } as RuleGroupDto;
      const get =
        serverType === MediaServerType.PLEX
          ? plexGetter.get
          : serverType === MediaServerType.JELLYFIN
            ? jellyfinGetter.get
            : embyGetter.get;
      mediaServerFactory.getConfiguredServerType.mockResolvedValue(serverType);
      get.mockResolvedValue([] as RuleValueType);

      await expect(
        service.get(
          [Application.PLEX, 46],
          item,
          ruleGroup,
          'movie',
          undefined,
          cache,
        ),
      ).resolves.toEqual([]);
      expect(get).toHaveBeenCalledWith(46, item, 'movie', ruleGroup, cache);
    },
  );

  it('preserves an undefined transient value from the configured getter', async () => {
    mediaServerFactory.getConfiguredServerType.mockResolvedValue(
      MediaServerType.PLEX,
    );
    plexGetter.get.mockResolvedValue(undefined);

    await expect(
      service.get([Application.PLEX, 46], item, { id: 1 } as RuleGroupDto),
    ).resolves.toBeUndefined();
  });
});
