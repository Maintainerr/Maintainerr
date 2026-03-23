import { Mocked } from '@suites/doubles.jest';
import { MetadataService } from '../../src/modules/metadata/metadata.service';

export function mockBuildServarrLookupCandidates(
  metadataService: Mocked<MetadataService>,
): void {
  metadataService.buildServarrLookupCandidates.mockImplementation(
    (ids = {}) => {
      const lookupCandidates: Array<{
        providerKey: 'tmdb' | 'tvdb';
        id: number;
      }> = [];

      for (const providerKey of ['tmdb', 'tvdb'] as const) {
        const id = ids[providerKey];
        if (typeof id === 'number') {
          lookupCandidates.push({ providerKey, id });
        }
      }

      return lookupCandidates;
    },
  );
}
