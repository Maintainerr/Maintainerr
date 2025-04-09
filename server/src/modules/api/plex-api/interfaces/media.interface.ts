import { PlexMetadata } from '@maintainerr/contracts';

export interface PlexMetadataResponse<T extends PlexMetadata = PlexMetadata> {
  MediaContainer: {
    Metadata: T[];
  };
}
