import {
  BaseItemKind,
  type BaseItemDto,
  type UserDto,
} from '@jellyfin/sdk/lib/generated-client/models';
import { JellyfinMapper } from './jellyfin.mapper';

describe('JellyfinMapper', () => {
  describe('toMediaItemType', () => {
    it.each([
      [BaseItemKind.Movie, 'movie'],
      [BaseItemKind.Series, 'show'],
      [undefined, 'movie'],
    ])('maps %s to %s', (input, expected) => {
      expect(JellyfinMapper.toMediaItemType(input as any)).toBe(expected);
    });
  });

  describe('toBaseItemKind', () => {
    it.each([
      ['show', BaseItemKind.Series],
      ['season', BaseItemKind.Season],
    ])('maps %s to %s', (input, expected) => {
      expect(JellyfinMapper.toBaseItemKind(input as any)).toBe(expected);
    });
  });

  describe('toBaseItemKinds', () => {
    it('should return Movie and Series for empty array', () => {
      const result = JellyfinMapper.toBaseItemKinds([]);
      expect(result).toContain(BaseItemKind.Movie);
      expect(result).toContain(BaseItemKind.Series);
    });
  });

  describe('extractProviderIds', () => {
    it('should extract multiple provider ids', () => {
      const providerIds = {
        Imdb: 'tt1234567',
        Tmdb: '12345',
        Tvdb: '67890',
      };
      const result = JellyfinMapper.extractProviderIds(providerIds);
      expect(result.imdb).toEqual(['tt1234567']);
      expect(result.tmdb).toEqual(['12345']);
      expect(result.tvdb).toEqual(['67890']);
    });
  });

  describe('toMediaItem', () => {
    describe('Episode', () => {
      const episodeItem = {
        Id: 'episode123',
        ParentId: 'season123',
        SeriesId: 'series123',
        Name: 'Test Episode',
        SeasonName: 'Season 1',
        SeriesName: 'Test Series',
        Type: BaseItemKind.Episode,
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
          Key: 'episode123',
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
        IndexNumberEnd: 2,
        ParentIndexNumber: 1,
        Tags: ['HD', '4K'],
      } as BaseItemDto;

      it('should convert episode with correct parent/grandparent hierarchy', () => {
        const result = JellyfinMapper.toMediaItem(episodeItem);

        expect(result.id).toBe('episode123');
        // Episode: parentId = season (from ParentId or SeasonId)
        expect(result.parentId).toBe('season123');
        // Episode: grandparentId = show (from SeriesId)
        expect(result.grandparentId).toBe('series123');
        expect(result.title).toBe('Test Episode');
        expect(result.parentTitle).toBe('Season 1');
        expect(result.grandparentTitle).toBe('Test Series');
        expect(result.guid).toBe('episode123');
        expect(result.type).toBe('episode');
      });

      it('carries the item path', () => {
        expect(JellyfinMapper.toMediaItem(episodeItem).path).toBeUndefined();
        expect(
          JellyfinMapper.toMediaItem({
            ...episodeItem,
            Path: '/media/series/Show A/Season 1/Show A - S01E01.mkv',
          }).path,
        ).toBe('/media/series/Show A/Season 1/Show A - S01E01.mkv');
      });

      it('should convert timestamps to Date objects', () => {
        const result = JellyfinMapper.toMediaItem(episodeItem);

        expect(result.addedAt).toEqual(new Date('2021-01-01T00:00:00.000Z'));
        expect(result.updatedAt).toEqual(new Date('2021-01-02T00:00:00.000Z'));
        expect(result.lastViewedAt).toEqual(
          new Date('2021-01-03T00:00:00.000Z'),
        );
      });

      it('keeps a missing DateCreated invalid instead of using the current time', () => {
        const result = JellyfinMapper.toMediaItem({
          ...episodeItem,
          DateCreated: undefined,
        });

        expect(Number.isNaN(result.addedAt.getTime())).toBe(true);
      });

      it('should convert media sources correctly', () => {
        const result = JellyfinMapper.toMediaItem(episodeItem);

        expect(result.mediaSources).toHaveLength(1);
        expect(result.mediaSources[0].id).toBe('source1');
        expect(result.mediaSources[0].duration).toBe(7200000);
        expect(result.mediaSources[0].videoCodec).toBe('h264');
        expect(result.mediaSources[0].audioCodec).toBe('aac');
        expect(result.mediaSources[0].audioChannels).toBe(6);
      });

      it('should convert genres correctly', () => {
        const result = JellyfinMapper.toMediaItem(episodeItem);

        expect(result.genres).toHaveLength(2);
        expect(result.genres![0].name).toBe('Action');
        expect(result.genres![1].name).toBe('Thriller');
      });

      it('should convert actors correctly', () => {
        const result = JellyfinMapper.toMediaItem(episodeItem);

        expect(result.actors).toHaveLength(1);
        expect(result.actors![0].name).toBe('Actor Name');
        expect(result.actors![0].role).toBe('Hero');
      });

      it('should convert labels from tags', () => {
        const result = JellyfinMapper.toMediaItem(episodeItem);

        expect(result.labels).toEqual(['HD', '4K']);
      });

      it('should preserve zero-valued and end indices', () => {
        const result = JellyfinMapper.toMediaItem({
          ...episodeItem,
          IndexNumber: 0,
          IndexNumberEnd: 1,
          ParentIndexNumber: 0,
        });

        expect(result.index).toBe(0);
        expect(result.indexEnd).toBe(1);
        expect(result.parentIndex).toBe(0);
      });

      it('should convert ratings correctly', () => {
        const result = JellyfinMapper.toMediaItem(episodeItem);

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
    });

    describe('Season', () => {
      it('should convert season with correct parent hierarchy', () => {
        const seasonItem: BaseItemDto = {
          Id: 'season123',
          ParentId: 'library123',
          SeriesId: 'series123',
          Name: 'Season 1',
          SeriesName: 'Test Series',
          Type: BaseItemKind.Season,
          IndexNumber: 1,
          DateCreated: '2021-01-01T00:00:00.000Z',
        };

        const result = JellyfinMapper.toMediaItem(seasonItem);

        expect(result.id).toBe('season123');
        // Season: parentId = show (from SeriesId, not library ParentId)
        expect(result.parentId).toBe('series123');
        // Season: no grandparent
        expect(result.grandparentId).toBeUndefined();
        expect(result.title).toBe('Season 1');
        expect(result.parentTitle).toBe('Test Series');
        expect(result.type).toBe('season');
        expect(result.index).toBe(1);
      });
    });

    describe('Movie', () => {
      it('should convert movie with library as parent', () => {
        const movieItem: BaseItemDto = {
          Id: 'movie123',
          ParentId: 'library123',
          Name: 'Test Movie',
          Type: BaseItemKind.Movie,
          DateCreated: '2021-01-01T00:00:00.000Z',
          Overview: 'A test movie',
          ProductionYear: 2021,
          Studios: [{ Name: 'Studio One' }, { Name: 'Studio Two' }],
          ProviderIds: {
            Imdb: 'tt1234567',
            Tmdb: '12345',
          },
        };

        const result = JellyfinMapper.toMediaItem(movieItem);

        expect(result.id).toBe('movie123');
        // Movie: parentId = library
        expect(result.parentId).toBe('library123');
        // Movie: no grandparent
        expect(result.grandparentId).toBeUndefined();
        expect(result.title).toBe('Test Movie');
        expect(result.type).toBe('movie');
        expect(result.summary).toBe('A test movie');
        expect(result.year).toBe(2021);
        expect(result.studios).toEqual(['Studio One', 'Studio Two']);
      });

      it('should handle missing optional fields', () => {
        const minimalItem: BaseItemDto = {
          Id: 'minimal123',
          Name: 'Minimal Item',
          Type: BaseItemKind.Movie,
        };

        const result = JellyfinMapper.toMediaItem(minimalItem);

        expect(result.id).toBe('minimal123');
        expect(result.title).toBe('Minimal Item');
        expect(result.parentId).toBeUndefined();
        expect(result.providerIds).toEqual({
          imdb: [],
          tmdb: [],
          tvdb: [],
          sportarr: [],
        });
        expect(result.mediaSources).toEqual([]);
        expect(result.genres).toEqual([]);
      });
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
  });

  describe('toMediaUser', () => {
    it('should convert user correctly', () => {
      const jellyfinUser: UserDto = {
        Id: 'user123',
        Name: 'Test User',
        PrimaryImageTag: 'imagetag',
        Policy: {
          IsAdministrator: true,
          AuthenticationProviderId:
            'Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider',
          PasswordResetProviderId:
            'Jellyfin.Server.Implementations.Users.DefaultPasswordResetProvider',
        },
      };

      const result = JellyfinMapper.toMediaUser(jellyfinUser);

      expect(result.id).toBe('user123');
      expect(result.name).toBe('Test User');
      expect(result.thumb).toBe('/Users/user123/Images/Primary');
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
});
