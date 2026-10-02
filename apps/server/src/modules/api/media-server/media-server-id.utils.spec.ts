import { MediaServerType } from '@maintainerr/contracts';
import {
  isForeignServerId,
  shouldRefreshMetadataItemId,
} from './media-server-id.utils';

describe('media-server-id.utils', () => {
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
  });

  describe('shouldRefreshMetadataItemId', () => {
    it('allows valid Plex id for Plex', () => {
      expect(shouldRefreshMetadataItemId(MediaServerType.PLEX, '12345')).toBe(
        true,
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

    // #2853: malformed strings used to slip through because the filter only
    // rejected the all-zero Guid and Plex-shaped numeric IDs. Anything else
    // - truncated UUIDs, non-hex garbage, fully-dashed but wrong-length - must
    // now be rejected before Maintainerr sends it to Jellyfin's refresh queue.
    it.each([
      'a852a27afe324084ae66db579ee3ee1', // 31 chars (truncated hex)
      'a852a27afe324084ae66db579ee3ee188', // 33 chars (oversized hex)
      'e9b2dcaa-529c-426e-9433-5e9981f27f2', // 35 chars (truncated dashed UUID)
      'e9b2dcaa-529c-426e-9433-5e9981f27f2ee', // 37 chars (oversized dashed UUID)
      'gggggggg-gggg-gggg-gggg-gggggggggggg', // non-hex chars
    ])('rejects malformed Jellyfin id %j', (value) => {
      expect(shouldRefreshMetadataItemId(MediaServerType.JELLYFIN, value)).toBe(
        false,
      );
    });
  });
});
