import { EMediaDataType } from '@maintainerr/contracts';
import { EPlexDataType } from '../../plex-api/enums/plex-data-type-enum';
import { PlexCollection } from '../../plex-api/interfaces/collection.interface';
import {
  PlexLibrary,
  PlexLibraryItem,
  PlexSeenBy,
  PlexUserAccount,
} from '../../plex-api/interfaces/library.interfaces';
import { PlexMapper } from './plex.mapper';

describe('PlexMapper', () => {
  describe('toMediaDataType', () => {
    it('should map movie type correctly', () => {
      expect(PlexMapper.toMediaDataType('movie')).toBe(EMediaDataType.MOVIES);
    });

    it('should map show type correctly', () => {
      expect(PlexMapper.toMediaDataType('show')).toBe(EMediaDataType.SHOWS);
    });

    it('should map season type correctly', () => {
      expect(PlexMapper.toMediaDataType('season')).toBe(EMediaDataType.SEASONS);
    });

    it('should map episode type correctly', () => {
      expect(PlexMapper.toMediaDataType('episode')).toBe(EMediaDataType.EPISODES);
    });

    it('should map collection type to movie as fallback', () => {
      expect(PlexMapper.toMediaDataType('collection')).toBe(EMediaDataType.MOVIES);
    });
  });

  describe('toPlexDataType', () => {
    it('should map MOVIE to MOVIES', () => {
      expect(PlexMapper.toPlexDataType(EMediaDataType.MOVIES)).toBe(
        EPlexDataType.MOVIES,
      );
    });

    it('should map SHOW to SHOWS', () => {
      expect(PlexMapper.toPlexDataType(EMediaDataType.SHOWS)).toBe(
        EPlexDataType.SHOWS,
      );
    });

    it('should map SEASON to SEASONS', () => {
      expect(PlexMapper.toPlexDataType(EMediaDataType.SEASONS)).toBe(
        EPlexDataType.SEASONS,
      );
    });

    it('should map EPISODE to EPISODES', () => {
      expect(PlexMapper.toPlexDataType(EMediaDataType.EPISODES)).toBe(
        EPlexDataType.EPISODES,
      );
    });
  });

  describe('fromPlexDataType', () => {
    it('should map MOVIES to MOVIE', () => {
      expect(PlexMapper.fromPlexDataType(EPlexDataType.MOVIES)).toBe(
        EMediaDataType.MOVIES,
      );
    });

    it('should map SHOWS to SHOW', () => {
      expect(PlexMapper.fromPlexDataType(EPlexDataType.SHOWS)).toBe(
        EMediaDataType.SHOWS,
      );
    });
  });

  describe('extractProviderIds', () => {
    it('should extract IMDB id from guid', () => {
      const guids = [{ id: 'imdb://tt1234567' }];
      const result = PlexMapper.extractProviderIds(guids);
      expect(result.imdb).toBe('tt1234567');
    });

    it('should extract TMDB id from guid', () => {
      const guids = [{ id: 'tmdb://12345' }];
      const result = PlexMapper.extractProviderIds(guids);
      expect(result.tmdb).toBe('12345');
    });

    it('should extract TVDB id from guid', () => {
      const guids = [{ id: 'tvdb://67890' }];
      const result = PlexMapper.extractProviderIds(guids);
      expect(result.tvdb).toBe('67890');
    });

    it('should extract multiple provider ids', () => {
      const guids = [
        { id: 'imdb://tt1234567' },
        { id: 'tmdb://12345' },
        { id: 'tvdb://67890' },
      ];
      const result = PlexMapper.extractProviderIds(guids);
      expect(result.imdb).toBe('tt1234567');
      expect(result.tmdb).toBe('12345');
      expect(result.tvdb).toBe('67890');
    });

    it('should ignore plex:// guids', () => {
      const guids = [{ id: 'plex://movie/5d776830880197001ec7f3eb' }];
      const result = PlexMapper.extractProviderIds(guids);
      expect(result.imdb).toBeUndefined();
      expect(result.tmdb).toBeUndefined();
      expect(result.tvdb).toBeUndefined();
    });

    it('should handle undefined guids', () => {
      const result = PlexMapper.extractProviderIds(undefined);
      expect(result).toEqual({});
    });

    it('should handle empty array', () => {
      const result = PlexMapper.extractProviderIds([]);
      expect(result).toEqual({});
    });

    it('should handle malformed guids', () => {
      const guids = [{ id: 'malformed-id' }, { id: '' }];
      const result = PlexMapper.extractProviderIds(guids);
      expect(result).toEqual({});
    });
  });

  describe('toMediaItem', () => {
    const basePlexItem: PlexLibraryItem = {
      ratingKey: '12345',
      parentRatingKey: '1234',
      grandparentRatingKey: '123',
      title: 'Test Movie',
      parentTitle: 'Parent Title',
      guid: 'plex://movie/abc',
      parentGuid: 'plex://show/abc',
      grandparentGuid: 'plex://library/abc',
      addedAt: 1609459200, // 2021-01-01 00:00:00
      updatedAt: 1609545600, // 2021-01-02 00:00:00
      Guid: [{ id: 'imdb://tt1234567' }, { id: 'tmdb://12345' }],
      type: 'movie',
      Media: [
        {
          id: 1,
          duration: 7200000, // 2 hours in ms
          bitrate: 5000,
          width: 1920,
          height: 1080,
          aspectRatio: 1.78,
          audioChannels: 6,
          audioCodec: 'aac',
          videoCodec: 'h264',
          videoResolution: '1080',
          container: 'mkv',
          videoFrameRate: '24p',
          videoProfile: 'high',
        },
      ],
      librarySectionTitle: 'Movies',
      librarySectionID: 1,
      librarySectionKey: '/library/sections/1',
      summary: 'Test summary',
      viewCount: 5,
      skipCount: 0,
      lastViewedAt: 1609632000, // 2021-01-03
      year: 2021,
      duration: 7200000,
      originallyAvailableAt: '2021-01-01',
      rating: 8.5,
      audienceRating: 9.0,
      userRating: 10,
      Genre: [{ id: 1, filter: 'genre/1', tag: 'Action' }],
      Role: [{ id: 1, filter: 'role/1', tag: 'Actor Name', role: 'Hero', thumb: '/thumb' }],
      leafCount: 10,
      viewedLeafCount: 5,
      index: 1,
      parentIndex: 1,
      Collection: [{ tag: 'My Collection' }],
      Label: [{ tag: 'HD' }],
    };

    it('should convert all basic fields correctly', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.id).toBe('12345');
      expect(result.parentId).toBe('1234');
      expect(result.grandparentId).toBe('123');
      expect(result.title).toBe('Test Movie');
      expect(result.parentTitle).toBe('Parent Title');
      expect(result.guid).toBe('plex://movie/abc');
      expect(result.type).toBe(EMediaDataType.MOVIES);
    });

    it('should convert timestamps to Date objects', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.addedAt).toEqual(new Date(1609459200 * 1000));
      expect(result.updatedAt).toEqual(new Date(1609545600 * 1000));
      expect(result.lastViewedAt).toEqual(new Date(1609632000 * 1000));
    });

    it('should extract provider IDs correctly', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.providerIds.imdb).toBe('tt1234567');
      expect(result.providerIds.tmdb).toBe('12345');
    });

    it('should convert media sources correctly', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.mediaSources).toHaveLength(1);
      expect(result.mediaSources[0].id).toBe('1');
      expect(result.mediaSources[0].duration).toBe(7200000);
      expect(result.mediaSources[0].videoCodec).toBe('h264');
    });

    it('should convert library info correctly', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.library.id).toBe('1');
      expect(result.library.title).toBe('Movies');
    });

    it('should convert genres correctly', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.genres).toHaveLength(1);
      expect(result.genres![0].name).toBe('Action');
    });

    it('should convert actors correctly', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.actors).toHaveLength(1);
      expect(result.actors![0].name).toBe('Actor Name');
      expect(result.actors![0].role).toBe('Hero');
    });

    it('should convert collections and labels', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.collections).toEqual(['My Collection']);
      expect(result.labels).toEqual(['HD']);
    });

    it('should convert ratings correctly', () => {
      const result = PlexMapper.toMediaItem(basePlexItem);

      expect(result.ratings).toHaveLength(2);
      expect(result.ratings).toContainEqual({
        source: 'critic',
        value: 8.5,
        type: 'critic',
      });
      expect(result.ratings).toContainEqual({
        source: 'audience',
        value: 9.0,
        type: 'audience',
      });
      expect(result.userRating).toBe(10);
    });
  });

  describe('toMediaLibrary', () => {
    it('should convert movie library correctly', () => {
      const plexLibrary: PlexLibrary = {
        type: 'movie',
        key: '1',
        title: 'Movies',
        agent: 'com.plexapp.agents.themoviedb',
      };

      const result = PlexMapper.toMediaLibrary(plexLibrary);

      expect(result.id).toBe('1');
      expect(result.title).toBe('Movies');
      expect(result.type).toBe('movie');
      expect(result.agent).toBe('com.plexapp.agents.themoviedb');
    });

    it('should convert show library correctly', () => {
      const plexLibrary: PlexLibrary = {
        type: 'show',
        key: '2',
        title: 'TV Shows',
        agent: 'com.plexapp.agents.thetvdb',
      };

      const result = PlexMapper.toMediaLibrary(plexLibrary);

      expect(result.type).toBe('show');
    });
  });

  describe('toMediaUser', () => {
    it('should convert user correctly', () => {
      const plexUser: PlexUserAccount = {
        id: 123,
        key: '/accounts/123',
        name: 'Test User',
        defaultAudioLanguage: 'en',
        autoSelectAudio: true,
        defaultSubtitleLanguage: 'en',
        subtitleMode: 1,
        thumb: '/user/thumb',
      };

      const result = PlexMapper.toMediaUser(plexUser);

      expect(result.id).toBe('123');
      expect(result.name).toBe('Test User');
      expect(result.thumb).toBe('/user/thumb');
    });
  });

  describe('toWatchRecord', () => {
    it('should convert watch record correctly', () => {
      const plexSeenBy: PlexSeenBy = {
        ratingKey: '12345',
        title: 'Test Movie',
        thumb: '/thumb',
        originallyAvailableAt: '2021-01-01',
        viewedAt: 1609459200,
        accountID: 123,
        deviceID: 456,
        historyKey: '/history/123',
        key: '/library/metadata/12345',
        // Inherited from PlexLibraryItem (required but not used in mapping)
        parentRatingKey: undefined,
        grandparentRatingKey: undefined,
        parentTitle: undefined,
        guid: '',
        parentGuid: undefined,
        grandparentGuid: undefined,
        addedAt: 0,
        updatedAt: 0,
        type: 'movie',
        Media: [],
        librarySectionTitle: '',
        librarySectionID: 0,
        librarySectionKey: '',
        summary: '',
        viewCount: 0,
        skipCount: 0,
        lastViewedAt: 0,
        year: 0,
        duration: 0,
      };

      const result = PlexMapper.toWatchRecord(plexSeenBy);

      expect(result.userId).toBe('123');
      expect(result.itemId).toBe('12345');
      expect(result.watchedAt).toEqual(new Date(1609459200 * 1000));
      expect(result.progress).toBe(100);
    });
  });

  describe('toMediaCollection', () => {
    it('should convert collection correctly', () => {
      const plexCollection: PlexCollection = {
        ratingKey: '99999',
        key: '/library/collections/99999',
        guid: 'plex://collection/abc',
        type: 'collection',
        title: 'My Collection',
        subtype: 'movie',
        summary: 'Collection summary',
        index: 1,
        ratingCount: 5,
        thumb: '/collection/thumb',
        addedAt: 1609459200,
        updatedAt: 1609545600,
        childCount: '10',
        maxYear: '2021',
        minYear: '2020',
        smart: false,
      };

      const result = PlexMapper.toMediaCollection(plexCollection);

      expect(result.id).toBe('99999');
      expect(result.title).toBe('My Collection');
      expect(result.summary).toBe('Collection summary');
      expect(result.thumb).toBe('/collection/thumb');
      expect(result.childCount).toBe(10);
      expect(result.addedAt).toEqual(new Date(1609459200 * 1000));
      expect(result.smart).toBe(false);
    });

    it('should handle invalid childCount', () => {
      const plexCollection: PlexCollection = {
        ratingKey: '99999',
        key: '/library/collections/99999',
        guid: 'plex://collection/abc',
        type: 'collection',
        title: 'My Collection',
        subtype: 'movie',
        summary: '',
        index: 1,
        ratingCount: 0,
        thumb: '',
        addedAt: 0,
        updatedAt: 0,
        childCount: 'invalid',
        maxYear: '',
        minYear: '',
      };

      const result = PlexMapper.toMediaCollection(plexCollection);

      expect(result.childCount).toBe(0);
    });
  });

  describe('toMediaServerStatus', () => {
    it('should convert server status correctly', () => {
      const plexStatus = {
        machineIdentifier: 'abc123',
        version: '1.25.0',
      };

      const result = PlexMapper.toMediaServerStatus(plexStatus, 'My Server');

      expect(result.machineId).toBe('abc123');
      expect(result.version).toBe('1.25.0');
      expect(result.name).toBe('My Server');
    });
  });
});
