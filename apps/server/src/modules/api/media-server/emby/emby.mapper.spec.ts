import { EmbyMapper } from './emby.mapper';
import type { EmbyBaseItemDto, EmbyUserDto } from './emby.types';

/**
 * EmbyMapper is a pure synchronous transform from Emby BaseItemDto into
 * Maintainerr's MediaItem contract. Emby's API and Jellyfin's API share the
 * same .NET-derived BaseItemDto field shape (Jellyfin forked Emby in 2018),
 * so the synthetic fixtures below mirror the ones in jellyfin.mapper.spec.ts
 * - they assert how the mapper transforms a known input, not what Emby
 * returns over the wire.
 */
describe('EmbyMapper', () => {
  describe('toMediaItemType', () => {
    it.each([
      ['Movie', 'movie'],
      ['Series', 'show'],
      ['Season', 'season'],
      ['Episode', 'episode'],
      [undefined, 'movie'],
      ['Unknown', 'movie'],
    ])('maps %s to %s', (input, expected) => {
      expect(EmbyMapper.toMediaItemType(input as any)).toBe(expected);
    });
  });

  describe('toEmbyItemKind', () => {
    it.each([
      ['movie', 'Movie'],
      ['show', 'Series'],
      ['season', 'Season'],
      ['episode', 'Episode'],
    ])('maps %s to %s', (input, expected) => {
      expect(EmbyMapper.toEmbyItemKind(input as any)).toBe(expected);
    });
  });

  describe('toEmbyItemKinds', () => {
    it('returns Movie and Series for an empty array', () => {
      expect(EmbyMapper.toEmbyItemKinds([])).toEqual(['Movie', 'Series']);
    });

    it('returns Movie and Series for undefined', () => {
      expect(EmbyMapper.toEmbyItemKinds(undefined)).toEqual([
        'Movie',
        'Series',
      ]);
    });

    it('maps multiple types correctly', () => {
      expect(EmbyMapper.toEmbyItemKinds(['movie', 'show'])).toEqual([
        'Movie',
        'Series',
      ]);
    });
  });

  describe('extractProviderIds', () => {
    it('extracts IMDB id', () => {
      expect(EmbyMapper.extractProviderIds({ Imdb: 'tt1234567' })).toEqual({
        imdb: ['tt1234567'],
        tmdb: [],
        tvdb: [],
      });
    });

    it('extracts TMDB id', () => {
      expect(EmbyMapper.extractProviderIds({ Tmdb: '12345' })).toEqual({
        imdb: [],
        tmdb: ['12345'],
        tvdb: [],
      });
    });

    it('extracts TVDB id', () => {
      expect(EmbyMapper.extractProviderIds({ Tvdb: '67890' })).toEqual({
        imdb: [],
        tmdb: [],
        tvdb: ['67890'],
      });
    });

    it('handles null', () => {
      expect(EmbyMapper.extractProviderIds(null)).toEqual({
        imdb: [],
        tmdb: [],
        tvdb: [],
      });
    });

    it('handles undefined', () => {
      expect(EmbyMapper.extractProviderIds(undefined)).toEqual({
        imdb: [],
        tmdb: [],
        tvdb: [],
      });
    });

    it('handles empty object', () => {
      expect(EmbyMapper.extractProviderIds({})).toEqual({
        imdb: [],
        tmdb: [],
        tvdb: [],
      });
    });
  });

  describe('toMediaItem parent/grandparent semantics', () => {
    it('episode parent is the season, grandparent is the show', () => {
      const item: EmbyBaseItemDto = {
        Id: 'episode-1',
        ParentId: 'season-1',
        SeasonId: 'season-1',
        SeriesId: 'show-1',
        Name: 'E1',
        SeasonName: 'S1',
        SeriesName: 'Show A',
        Type: 'Episode',
      };

      const result = EmbyMapper.toMediaItem(item);

      expect(result.parentId).toBe('season-1');
      expect(result.grandparentId).toBe('show-1');
      expect(result.parentTitle).toBe('S1');
      expect(result.grandparentTitle).toBe('Show A');
      expect(result.type).toBe('episode');
    });

    it('season parent is the show (SeriesId), not the library', () => {
      const item: EmbyBaseItemDto = {
        Id: 'season-1',
        ParentId: 'library-1',
        SeriesId: 'show-1',
        Name: 'S1',
        SeriesName: 'Show A',
        Type: 'Season',
        IndexNumber: 1,
      };

      const result = EmbyMapper.toMediaItem(item);

      expect(result.parentId).toBe('show-1');
      expect(result.grandparentId).toBeUndefined();
      expect(result.type).toBe('season');
      expect(result.index).toBe(1);
    });

    it('show parent is the library', () => {
      const item: EmbyBaseItemDto = {
        Id: 'show-1',
        ParentId: 'library-1',
        Name: 'Show A',
        Type: 'Series',
      };

      const result = EmbyMapper.toMediaItem(item);

      expect(result.parentId).toBe('library-1');
      expect(result.grandparentId).toBeUndefined();
      expect(result.type).toBe('show');
    });

    it('movie parent is the library', () => {
      const item: EmbyBaseItemDto = {
        Id: 'movie-1',
        ParentId: 'library-1',
        Name: 'Movie A',
        Type: 'Movie',
      };

      const result = EmbyMapper.toMediaItem(item);

      expect(result.parentId).toBe('library-1');
      expect(result.grandparentId).toBeUndefined();
      expect(result.type).toBe('movie');
    });
  });

  describe('toMediaItem field conversion', () => {
    const baseItem: EmbyBaseItemDto = {
      Id: 'movie-1',
      ParentId: 'library-1',
      Name: 'Movie A',
      Type: 'Movie',
      DateCreated: '2021-01-01T00:00:00.000Z',
      Overview: 'A short description',
      ProductionYear: 2021,
      PremiereDate: '2021-01-01T00:00:00.000Z',
      RunTimeTicks: 72000000000, // 2 hours in 100-ns ticks
      ProviderIds: { Imdb: 'tt1234567', Tmdb: '12345' },
      MediaSources: [
        {
          Id: 'source-1',
          RunTimeTicks: 72000000000,
          Bitrate: 5000000,
          Container: 'mkv',
          Size: 4_000_000_000,
          MediaStreams: [
            {
              Type: 'Video',
              Width: 1920,
              Height: 1080,
              Codec: 'h264',
              AspectRatio: '16:9',
            },
            {
              Type: 'Audio',
              Channels: 6,
              Codec: 'aac',
            },
          ],
        },
      ],
      UserData: {
        PlayCount: 5,
        LastPlayedDate: '2021-01-03T00:00:00.000Z',
      },
      CommunityRating: 8.5,
      Genres: ['Drama', 'Mystery'],
      People: [
        {
          Id: 'actor-1',
          Name: 'Performer One',
          Type: 'Actor',
          Role: 'Lead',
          PrimaryImageTag: 'tag-1',
        },
        {
          Id: 'director-1',
          Name: 'Director One',
          Type: 'Director',
        },
      ],
      Tags: ['HD', '4K'],
    };

    it('converts ISO timestamps to Date objects', () => {
      const result = EmbyMapper.toMediaItem(baseItem);

      expect(result.addedAt).toEqual(new Date('2021-01-01T00:00:00.000Z'));
      expect(result.lastViewedAt).toEqual(new Date('2021-01-03T00:00:00.000Z'));
    });

    it('converts RunTimeTicks (100-ns) to milliseconds', () => {
      const result = EmbyMapper.toMediaItem(baseItem);

      // 72_000_000_000 ticks / 10_000 ticks-per-ms = 7_200_000 ms = 2h
      expect(result.durationMs).toBe(7_200_000);
      expect(result.mediaSources[0].duration).toBe(7_200_000);
    });

    it('converts media sources', () => {
      const result = EmbyMapper.toMediaItem(baseItem);

      expect(result.mediaSources).toHaveLength(1);
      expect(result.mediaSources[0]).toMatchObject({
        id: 'source-1',
        bitrate: 5000000,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 6,
        container: 'mkv',
        sizeBytes: 4_000_000_000,
      });
    });

    it('parses AspectRatio expressed as a fraction', () => {
      const result = EmbyMapper.toMediaItem(baseItem);

      expect(result.mediaSources[0].aspectRatio).toBeCloseTo(16 / 9);
    });

    it('filters People down to actors and preserves order', () => {
      const result = EmbyMapper.toMediaItem(baseItem);

      expect(result.actors).toHaveLength(1);
      expect(result.actors![0]).toMatchObject({
        name: 'Performer One',
        role: 'Lead',
      });
    });

    it('hashes genre names into deterministic, stable ids', () => {
      const result = EmbyMapper.toMediaItem(baseItem);

      const again = EmbyMapper.toMediaItem(baseItem);
      expect(result.genres).toHaveLength(2);
      expect(result.genres![0].name).toBe('Drama');
      expect(result.genres![0].id).toBe(again.genres![0].id);
    });

    it('extracts community rating as audience and critic when present', () => {
      const result = EmbyMapper.toMediaItem({
        ...baseItem,
        CriticRating: 85,
      } as any);

      expect(result.ratings).toContainEqual({
        source: 'community',
        value: 8.5,
        type: 'audience',
      });
      // CriticRating is on a 0-100 scale; normalised to 0-10
      expect(result.ratings).toContainEqual({
        source: 'critic',
        value: 8.5,
        type: 'critic',
      });
    });

    it('returns labels from Tags', () => {
      const result = EmbyMapper.toMediaItem(baseItem);
      expect(result.labels).toEqual(['HD', '4K']);
    });

    it('handles minimal items without crashing', () => {
      const result = EmbyMapper.toMediaItem({
        Id: 'minimal-1',
        Name: 'Minimal',
        Type: 'Movie',
      });

      expect(result.id).toBe('minimal-1');
      expect(result.title).toBe('Minimal');
      expect(result.parentId).toBeUndefined();
      expect(result.providerIds).toEqual({ imdb: [], tmdb: [], tvdb: [] });
      expect(result.mediaSources).toEqual([]);
      expect(result.genres).toEqual([]);
      expect(result.actors).toEqual([]);
      expect(result.ratings).toEqual([]);
    });
  });

  describe('toMediaLibrary', () => {
    it.each([
      ['movies', 'movie'],
      ['tvshows', 'show'],
      ['music', 'movie'], // default
      [undefined, 'movie'],
    ])('maps CollectionType %s to MediaLibrary.type %s', (input, expected) => {
      const result = EmbyMapper.toMediaLibrary({
        Id: 'lib-1',
        Name: 'Library',
        CollectionType: input as any,
      });

      expect(result.type).toBe(expected);
    });
  });

  describe('toMediaUser', () => {
    it('builds the thumbnail path when PrimaryImageTag is present', () => {
      const user: EmbyUserDto = {
        Id: 'user-1',
        Name: 'Owner',
        PrimaryImageTag: 'tag',
      };
      const result = EmbyMapper.toMediaUser(user);

      expect(result.thumb).toBe('/Users/user-1/Images/Primary');
    });

    it('returns undefined thumb when no image tag exists', () => {
      const user: EmbyUserDto = { Id: 'user-2', Name: 'NoImage' };

      expect(EmbyMapper.toMediaUser(user).thumb).toBeUndefined();
    });
  });

  describe('toMediaCollection', () => {
    it('flags every collection as non-smart (Emby has no smart collections)', () => {
      const result = EmbyMapper.toMediaCollection({
        Id: 'col-1',
        Name: 'Bundle',
        ParentId: 'lib-1',
        ChildCount: 3,
        ImageTags: { Primary: 'tag' },
      });

      expect(result.smart).toBe(false);
      expect(result.thumb).toBe('/Items/col-1/Images/Primary');
      expect(result.libraryId).toBe('lib-1');
      expect(result.childCount).toBe(3);
    });
  });

  describe('toMediaPlaylist', () => {
    it('converts RunTimeTicks to durationMs and reports itemCount from ChildCount', () => {
      const result = EmbyMapper.toMediaPlaylist({
        Id: 'pl-1',
        Name: 'Playlist',
        ChildCount: 25,
        RunTimeTicks: 36000000000, // 1 hour
      });

      expect(result.itemCount).toBe(25);
      expect(result.durationMs).toBe(3_600_000);
      expect(result.smart).toBe(false);
    });
  });

  describe('toMediaServerStatus', () => {
    it('passes through server name and platform', () => {
      const result = EmbyMapper.toMediaServerStatus(
        'machine-1',
        '4.9.3.0',
        'Server',
        'Linux',
      );

      expect(result).toMatchObject({
        machineId: 'machine-1',
        version: '4.9.3.0',
        name: 'Server',
        platform: 'Linux',
      });
    });

    it('treats null optional fields as undefined', () => {
      const result = EmbyMapper.toMediaServerStatus(
        'machine-1',
        '4.9.3.0',
        null,
        null,
      );

      expect(result.name).toBeUndefined();
      expect(result.platform).toBeUndefined();
    });
  });

  describe('toWatchRecord', () => {
    it('defaults progress to 100 when not provided', () => {
      const result = EmbyMapper.toWatchRecord(
        'user-1',
        'item-1',
        new Date('2021-01-01T00:00:00.000Z'),
      );

      expect(result).toEqual({
        userId: 'user-1',
        itemId: 'item-1',
        watchedAt: new Date('2021-01-01T00:00:00.000Z'),
        progress: 100,
      });
    });

    it('leaves watchedAt undefined when lastPlayedDate is missing', () => {
      const result = EmbyMapper.toWatchRecord('user-1', 'item-1');
      expect(result.watchedAt).toBeUndefined();
    });
  });
});
