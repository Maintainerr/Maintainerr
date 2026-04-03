import { Controller, Get, Param, Query } from '@nestjs/common';
import { MetadataService } from './metadata.service';

@Controller('api/metadata')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  private parseIds(
    query: Record<string, string>,
  ): Record<string, string | number> | undefined {
    const ids: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(query)) {
      if (!key.endsWith('Id') || !value) {
        continue;
      }

      const normalizedKey = key.slice(0, -2).toLowerCase();
      const numericValue = Number(value);
      ids[normalizedKey] = Number.isFinite(numericValue) ? numericValue : value;
    }

    return Object.keys(ids).length > 0 ? ids : undefined;
  }

  @Get('/backdrop/:type')
  async getBackdropImage(
    @Param('type') type: 'movie' | 'show',
    @Query() query: Record<string, string>,
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    const ids = this.parseIds(query);
    if (!ids) {
      return undefined;
    }

    return this.metadata.getBackdropUrl(ids, type === 'show' ? 'tv' : 'movie');
  }

  @Get('/image/:type')
  async getImage(
    @Param('type') type: 'movie' | 'show',
    @Query() query: Record<string, string>,
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    const ids = this.parseIds(query);
    if (!ids) {
      return undefined;
    }

    return this.metadata.getPosterUrl(
      ids,
      type === 'show' ? 'tv' : 'movie',
      'w300_and_h450_face',
    );
  }
}
