import { Injectable } from '@nestjs/common';
import { MetadataService } from '../metadata/metadata.service';

@Injectable()
export class MediaIdFinder {
  constructor(private readonly metadataService: MetadataService) {}

  public async findTvdbId(
    mediaServerId: string | number,
    tmdbId?: number | null,
  ) {
    return this.metadataService.resolveTvdbId(mediaServerId.toString(), tmdbId);
  }
}
