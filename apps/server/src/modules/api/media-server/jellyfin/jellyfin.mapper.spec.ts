import {
  BaseItemKind,
  type BaseItemDto,
  type UserDto,
} from '@jellyfin/sdk/lib/generated-client/models';
import { EMediaDataType } from '@maintainerr/contracts';
import { JellyfinMapper } from './jellyfin.mapper';

describe('JellyfinMapper', () => {
  describe('toMediaDataType', () => {
    it('should map Movie type correctly', () => {
      expect(JellyfinMapper.toMediaDataType(BaseItemKind.Movie)).toBe(
        EMediaDataType.MOVIE,
      );
    });

    it('should map Movie string correctly', () => {
      expect(JellyfinMapper.toMediaDataType('Movie')).toBe(EMediaDataType.MOVIE);
    });

    it('should map Series type correctly', () => {
      expect(JellyfinMapper.toMediaDataType(BaseItemKind.Series)).toBe(
        EMediaDataType.SHOW,
      );
    });

    it('should map Series string correctly', () => {
      expect(JellyfinMapper.toMediaDataType('Series')).toBe(EMediaDataType.SHOW);
    });

    it('should map Season type correctly', () => {
      expect(JellyfinMapper.toMediaDataType(BaseItemKind.Season)).toBe(
        EMediaDataType.SEASON,
      );
    });

    it('should map Episode type correctly', () => {
      expect(JellyfinMapper.toMediaDataType(BaseItemKind.Episode)).toBe(
        EMediaDataType.EPISODE,
      );
    });

    it('should default to MOVIE for unknown types', () => {
      expect(JellyfinMapper.toMediaDataType(undefined)).toBe(EMediaDataType.MOVIE);
      expect(JellyfinMapper.toMediaDataType('Unknown')).toBe(EMediaDataType.MOVIE);
    });
  });

  describe('toBaseItemKind', () => {
    it('should map MOVIE to Movie', () => {
      expect(JellyfinMapper.toBaseItemKind(EMediaDataType.MOVIE)).toBe(
        BaseItemKind.Movie,
      );
    });

    it('should map SHOW to Series', () => {
      expect(JellyfinMapper.toBaseItemKind(EMediaDataType.SHOW)).toBe(
        BaseItemKind.Series,
      );
    });

    it('should map SEASON to Season', () => {
      expect(JellyfinMapper.toBaseItemKind(EMediaDataType.SEASON)).toBe(
        BaseItemKind.Season,
      );
    });

    it('should map EPISODE to Episode', () => {
      expect(JellyfinMapper.toBaseItemKind(EMediaDataType.EPISODE)).toBe(
        BaseItemKind.Episode,
      );
    });
  });

  describe('toBaseItemKinds', () => {
    it('should return Movie and Series for empty array', () => {
      const result = JellyfinMapper.toBaseItemKinds([]);
      expect(result).toContain(BaseItemKind.Movie);
      expect(result).toContain(BaseItemKind.Series);
    });

    it('should return Movie and Series for undefined', () => {
      const result = JellyfinMapper.toBaseItemKinds(undefined);
      expect(result).toContain(BaseItemKind.Movie);
      expect(result).toContain(BaseItemKind.Series);
    });

    it('should map multiple types correctly', () => {
      const result = JellyfinMapper.toBaseItemKinds([
        EMediaDataType.MOVIE,
        EMediaDataType.SHOW,
      ]);
      expect(result).toEqual([BaseItemKind.Movie, BaseItemKind.Series]);
    });
  });

  describe('extractProviderIds', () => {
    it('should extract IMDB id correctly', () => {
      const providerIds = { Imdb: 'tt1234567' };
      const result = JellyfinMapper.extractProviderIds(providerIds);
      expect(result.imdb).toBe('tt1234567');
    });

    it('should extract TMDB id correctly', () => {
      const providerIds = { Tmdb: '12345' };
      const result = JellyfinMapper.extractProviderIds(providerIds);
      expect(result.tmdb).toBe('12345');
    });

    it('should extract TVDB id correctly', () => {
      const providerIds = { Tvdb: '67890' };
      const result = JellyfinMapper.extractProviderIds(providerIds);
      expect(result.tvdb).toBe('67890');
    });

    it('should extract multiple provider ids', () => {
      const providerIds = {
        Imdb: 'tt1234567',
        Tmdb: '12345',
        Tvdb: '67890',
      };
      const result = JellyfinMapper.extractProviderIds(providerIds);
      expect(result.imdb).toBe('tt1234567');
      expect(result.tmdb).toBe('12345');
      expect(result.tvdb).toBe('67890');
    });

    it('should handle undefined provider ids', () => {
      const result = JellyfinMapper.extractProviderIds(undefined);
      expect(result).toEqual({});
    });

    it('should handle null provider ids', () => {
      const result = JellyfinMapper.extractProviderIds(null);
      expect(result).toEqual({});
    });

    it('should handle empty provider ids', () => {
      const result = JellyfinMapper.extractProviderIds({});
      expect(result).toEqual({});
    });
  });

  describe('toMediaItem', () => {
    const baseJellyfinItem = {
      Id: 'abc123',
      ParentId: 'parent123',
      SeriesId: 'series123',
      Name: 'Test Movie',
      SeasonName: 'Season 1',
      SeriesName: 'Test Series',
      Type: BaseItemKind.Movie,
      DateCreated: '2021-01-01T00:00:00.000Z',
      DateLastSaved: '2021-01-02T00:00:00.000Z',
      ProviderIds: {
        Imdb: 'tt1234567',
        Tmdb: '12345',
      },
      MediaSources: [
        {
          Id: 'source1',
          RunTimeTicks: 72000000000, // 2 hours in ticks
          Bitrate: 5000000,
          Container: 'mkv',
          MediaStreams: [
            {
              Type: 'Video' as const,
              Width: 1920,
              Height: 1080,
              Codec: 'h264',
              AspectRatio: '16:9',
            },
            {
              Type: 'Audio' as const,
              Channels: 6,
              Codec: 'aac',
            },
          ],
        },
      ],
      Overview: 'Test summary',
      UserData: {
        PlayCount: 5,
        LastPlayedDate: '2021-01-03T00:00:00.000Z',
        Played: true,
      },
      ProductionYear: 2021,
      RunTimeTicks: 72000000000,
      PremiereDate: '2021-01-01T00:00:00.000Z',
      CommunityRating: 8.5,
      CriticRating: 85,
      Genres: ['Action', 'Thriller'],
      People: [
        {
          Id: 'actor1',
          Name: 'Actor Name',
          Type: 'Actor',
          Role: 'Hero',
          PrimaryImageTag: 'tag1',
        },
      ],
      ChildCount: 10,
      IndexNumber: 1,
      ParentIndexNumber: 1,
      Tags: ['HD', '4K'],
    } as BaseItemDto;

    it('should convert all basic fields correctly', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      expect(result.id).toBe('abc123');
      expect(result.parentId).toBe('parent123');
      expect(result.grandparentId).toBe('series123');
      expect(result.title).toBe('Test Movie');
      expect(result.parentTitle).toBe('Season 1');
      expect(result.grandparentTitle).toBe('Test Series');
      expect(result.guid).toBe('abc123');
      expect(result.type).toBe(EMediaDataType.MOVIE);
    });

    it('should convert timestamps to Date objects', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      expect(result.addedAt).toEqual(new Date('2021-01-01T00:00:00.000Z'));
      expect(result.updatedAt).toEqual(new Date('2021-01-02T00:00:00.000Z'));
      expect(result.lastViewedAt).toEqual(new Date('2021-01-03T00:00:00.000Z'));
    });

    it('should extract provider IDs correctly', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      expect(result.providerIds.imdb).toBe('tt1234567');
      expect(result.providerIds.tmdb).toBe('12345');
    });

    it('should convert duration from ticks to milliseconds', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      // 72000000000 ticks / 10000 = 7200000 ms = 2 hours
      expect(result.durationMs).toBe(7200000);
    });

    it('should convert media sources correctly', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      expect(result.mediaSources).toHaveLength(1);
      expect(result.mediaSources[0].id).toBe('source1');
      expect(result.mediaSources[0].duration).toBe(7200000);
      expect(result.mediaSources[0].videoCodec).toBe('h264');
      expect(result.mediaSources[0].audioCodec).toBe('aac');
      expect(result.mediaSources[0].audioChannels).toBe(6);
    });

    it('should convert genres correctly', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      expect(result.genres).toHaveLength(2);
      expect(result.genres![0].name).toBe('Action');
      expect(result.genres![1].name).toBe('Thriller');
    });

    it('should convert actors correctly', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      expect(result.actors).toHaveLength(1);
      expect(result.actors![0].name).toBe('Actor Name');
      expect(result.actors![0].role).toBe('Hero');
    });

    it('should convert labels from tags', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      expect(result.labels).toEqual(['HD', '4K']);
    });

    it('should convert ratings correctly', () => {
      const result = JellyfinMapper.toMediaItem(baseJellyfinItem);

      expect(result.ratings).toHaveLength(2);
      expect(result.ratings).toContainEqual({
        source: 'community',
        value: 8.5,
        type: 'audience',
      });
      // Critic rating is normalized from 0-100 to 0-10
      expect(result.ratings).toContainEqual({
        source: 'critic',
        value: 8.5,
        type: 'critic',
      });
    });

    it('should handle missing optional fields', () => {
      const minimalItem: BaseItemDto = {
        Id: 'minimal123',
        Name: 'Minimal Movie',
        Type: BaseItemKind.Movie,
      };

      const result = JellyfinMapper.toMediaItem(minimalItem);

      expect(result.id).toBe('minimal123');
      expect(result.title).toBe('Minimal Movie');
      expect(result.parentId).toBeUndefined();
      expect(result.providerIds).toEqual({});
      expect(result.mediaSources).toEqual([]);
      expect(result.genres).toEqual([]);
    });
  });

  describe('toMediaLibrary', () => {
    it('should convert movie library correctly', () => {
      const jellyfinLibrary: BaseItemDto = {
        Id: 'lib1',
        Name: 'Movies',
        CollectionType: 'movies',
      };

      const result = JellyfinMapper.toMediaLibrary(jellyfinLibrary);

      expect(result.id).toBe('lib1');
      expect(result.title).toBe('Movies');
      expect(result.type).toBe('movie');
    });

    it('should convert TV shows library correctly', () => {
      const jellyfinLibrary: BaseItemDto = {
        Id: 'lib2',
        Name: 'TV Shows',
        CollectionType: 'tvshows',
      };

      const result = JellyfinMapper.toMediaLibrary(jellyfinLibrary);

      expect(result.type).toBe('show');
    });

    it('should default to movie for unknown collection types', () => {
      const jellyfinLibrary: BaseItemDto = {
        Id: 'lib3',
        Name: 'Unknown',
        CollectionType: 'music',
      };

      const result = JellyfinMapper.toMediaLibrary(jellyfinLibrary);

      expect(result.type).toBe('movie');
    });
  });

  describe('toMediaUser', () => {
    it('should convert user correctly', () => {
      const jellyfinUser: UserDto = {
        Id: 'user123',
        Name: 'Test User',
        PrimaryImageTag: 'imagetag',
        Policy: {
          IsAdministrator: true,
          AuthenticationProviderId: 'Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider',
          PasswordResetProviderId: 'Jellyfin.Server.Implementations.Users.DefaultPasswordResetProvider',
        },
      };

      const result = JellyfinMapper.toMediaUser(jellyfinUser);

      expect(result.id).toBe('user123');
      expect(result.name).toBe('Test User');
      expect(result.thumb).toBe('/Users/user123/Images/Primary');
    });

    it('should handle user without image', () => {
      const jellyfinUser: UserDto = {
        Id: 'user456',
        Name: 'No Image User',
      };

      const result = JellyfinMapper.toMediaUser(jellyfinUser);

      expect(result.thumb).toBeUndefined();
    });
  });

  describe('toWatchRecord', () => {
    it('should create watch record correctly', () => {
      const result = JellyfinMapper.toWatchRecord(
        'user123',
        'item456',
        new Date('2021-01-01T00:00:00.000Z'),
        5,
      );

      expect(result.userId).toBe('user123');
      expect(result.itemId).toBe('item456');
      expect(result.watchedAt).toEqual(new Date('2021-01-01T00:00:00.000Z'));
      expect(result.progress).toBe(100);
    });

    it('should use current date if no lastPlayedDate', () => {
      const before = new Date();
      const result = JellyfinMapper.toWatchRecord('user123', 'item456', undefined, 1);
      const after = new Date();

      expect(result.watchedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.watchedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('toMediaCollection', () => {
    it('should convert collection correctly', () => {
      const jellyfinCollection: BaseItemDto = {
        Id: 'col123',
        Name: 'My Collection',
        Overview: 'Collection description',
        ImageTags: { Primary: 'imagetag' },
        ChildCount: 10,
        DateCreated: '2021-01-01T00:00:00.000Z',
        ParentId: 'lib1',
      };

      const result = JellyfinMapper.toMediaCollection(jellyfinCollection);

      expect(result.id).toBe('col123');
      expect(result.title).toBe('My Collection');
      expect(result.summary).toBe('Collection description');
      expect(result.thumb).toBe('/Items/col123/Images/Primary');
      expect(result.childCount).toBe(10);
      expect(result.addedAt).toEqual(new Date('2021-01-01T00:00:00.000Z'));
      expect(result.smart).toBe(false);
      expect(result.libraryId).toBe('lib1');
    });
  });

  describe('toMediaPlaylist', () => {
    it('should convert playlist correctly', () => {
      const jellyfinPlaylist: BaseItemDto = {
        Id: 'pl123',
        Name: 'My Playlist',
        Overview: 'Playlist description',
        ChildCount: 25,
        RunTimeTicks: 36000000000, // 1 hour
        DateCreated: '2021-01-01T00:00:00.000Z',
      };

      const result = JellyfinMapper.toMediaPlaylist(jellyfinPlaylist);

      expect(result.id).toBe('pl123');
      expect(result.title).toBe('My Playlist');
      expect(result.summary).toBe('Playlist description');
      expect(result.itemCount).toBe(25);
      expect(result.durationMs).toBe(3600000); // 1 hour in ms
      expect(result.smart).toBe(false);
    });
  });

  describe('toMediaServerStatus', () => {
    it('should convert server status correctly', () => {
      const result = JellyfinMapper.toMediaServerStatus(
        'server123',
        '10.11.0',
        'My Jellyfin Server',
        'Linux',
      );

      expect(result.machineId).toBe('server123');
      expect(result.version).toBe('10.11.0');
      expect(result.name).toBe('My Jellyfin Server');
      expect(result.platform).toBe('Linux');
    });

    it('should handle null optional fields', () => {
      const result = JellyfinMapper.toMediaServerStatus('server123', '10.11.0', null, null);

      expect(result.name).toBeUndefined();
      expect(result.platform).toBeUndefined();
    });
  });
});
