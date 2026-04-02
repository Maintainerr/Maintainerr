import { MediaServerType } from '@maintainerr/contracts';
import {
  isForeignServerId,
  isJellyfinEmptyGuid,
  isLikelyJellyfinId,
  isLikelyPlexId,
  shouldRefreshMetadataItemId,
} from './media-server-id.utils';

describe('media-server-id.utils', () => {
  describe('isLikelyPlexId', () => {
    it('returns true for a numeric id', () => {
      expect(isLikelyPlexId('12345')).toBe(true);
    });

    it.each([
      ['blank', ''],
      ['Jellyfin id', 'a852a27afe324084ae66db579ee3ee18'],
    ])('returns false for %s', (_label, value) => {
      expect(isLikelyPlexId(value)).toBe(false);
    });
  });

  describe('isLikelyJellyfinId', () => {
    it.each([
      'a852a27afe324084ae66db579ee3ee18',
      'e9b2dcaa-529c-426e-9433-5e9981f27f2e',
    ])('returns true for %j', (value) => {
      expect(isLikelyJellyfinId(value)).toBe(true);
    });

    it.each([
      ['blank', ''],
      ['wrong length', 'a852a27afe324084ae66db579ee3ee1'],
      ['dash at wrong position', 'e9b2dcaa529c-426e-9433-5e9981f27f2e'],
    ])('returns false for %s', (_label, value) => {
      expect(isLikelyJellyfinId(value)).toBe(false);
    });
  });

  describe('isJellyfinEmptyGuid', () => {
    it.each([
      '00000000-0000-0000-0000-000000000000',
      '00000000000000000000000000000000',
    ])('returns true for %j', (value) => {
      expect(isJellyfinEmptyGuid(value)).toBe(true);
    });

    it('returns false for a non-empty id', () => {
      expect(isJellyfinEmptyGuid('a852a27afe324084ae66db579ee3ee18')).toBe(
        false,
      );
    });
  });

  describe('isForeignServerId', () => {
    it('returns true for blank on both server types', () => {
      expect(isForeignServerId(MediaServerType.PLEX, '')).toBe(true);
      expect(isForeignServerId(MediaServerType.JELLYFIN, '')).toBe(true);
    });

    it.each([
      'a852a27afe324084ae66db579ee3ee18',
      'e9b2dcaa-529c-426e-9433-5e9981f27f2e',
    ])('returns true when Plex sees Jellyfin id %j', (value) => {
      expect(isForeignServerId(MediaServerType.PLEX, value)).toBe(true);
    });

    it('returns false when Plex sees a numeric id', () => {
      expect(isForeignServerId(MediaServerType.PLEX, '12345')).toBe(false);
    });

    it('returns true when Jellyfin sees a numeric id', () => {
      expect(isForeignServerId(MediaServerType.JELLYFIN, '12345')).toBe(true);
    });

    it('returns false when Jellyfin sees a Jellyfin id', () => {
      expect(
        isForeignServerId(
          MediaServerType.JELLYFIN,
          'a852a27afe324084ae66db579ee3ee18',
        ),
      ).toBe(false);
    });
  });

  describe('shouldRefreshMetadataItemId', () => {
    it('rejects blank', () => {
      expect(shouldRefreshMetadataItemId(MediaServerType.JELLYFIN, '')).toBe(
        false,
      );
    });

    it('allows valid Plex id for Plex', () => {
      expect(shouldRefreshMetadataItemId(MediaServerType.PLEX, '12345')).toBe(
        true,
      );
    });

    it.each([
      'a852a27afe324084ae66db579ee3ee18',
      'e9b2dcaa-529c-426e-9433-5e9981f27f2e',
    ])('rejects Jellyfin id %j for Plex', (value) => {
      expect(shouldRefreshMetadataItemId(MediaServerType.PLEX, value)).toBe(
        false,
      );
    });

    it('allows valid Jellyfin id for Jellyfin', () => {
      expect(
        shouldRefreshMetadataItemId(
          MediaServerType.JELLYFIN,
          'a852a27afe324084ae66db579ee3ee18',
        ),
      ).toBe(true);
    });

    it.each([
      '00000000-0000-0000-0000-000000000000',
      '00000000000000000000000000000000',
    ])('rejects empty GUID %j for Jellyfin', (value) => {
      expect(shouldRefreshMetadataItemId(MediaServerType.JELLYFIN, value)).toBe(
        false,
      );
    });

    it('rejects Plex numeric id for Jellyfin', () => {
      expect(
        shouldRefreshMetadataItemId(MediaServerType.JELLYFIN, '12345'),
      ).toBe(false);
    });
  });
});
