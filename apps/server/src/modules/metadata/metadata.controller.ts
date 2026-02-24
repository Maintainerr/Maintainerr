import { Controller, Get, Param, Query } from '@nestjs/common';
import { MetadataService } from './metadata.service';

/**
 * HTTP controller for metadata endpoints.
 * All metadata flows through MetadataService which handles provider preference.
 *
 * Callers pass all known provider IDs as query params (e.g. ?tmdbId=123&tvdbId=456);
 * the service picks the best provider based on user preference and falls back automatically.
 */
@Controller('api/metadata')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  /**
   * Extract all `*Id` query params into a numeric ID map.
   * Any query param ending in "Id" with a valid numeric value is included.
   */
  private parseIds(
    query: Record<string, string>,
  ): Record<string, number> | undefined {
    const ids: Record<string, number> = {};
    for (const [key, value] of Object.entries(query)) {
      if (key.endsWith('Id') && value) {
        const num = +value;
        if (num) ids[key] = num;
      }
    }
    return Object.keys(ids).length ? ids : undefined;
  }

  /**
   * Returns a full backdrop image URL and which provider served it.
   * Falls back across providers based on user preference.
   */
  @Get('/backdrop/:type')
  async getBackdropImage(
    @Param('type') type: 'movie' | 'show',
    @Query() query: Record<string, string>,
  ): Promise<{ url: string; provider: string } | undefined> {
    console.log('[DEBUG] getBackdropImage query:', query);
    const ids = this.parseIds(query);
    console.log('[DEBUG] getBackdropImage parsed ids:', ids);
    if (!ids) return undefined;
    const providerType = type === 'show' ? 'tv' : 'movie';
    const result = await this.metadata.getBackdropUrl(ids, providerType);
    console.log('[DEBUG] getBackdropImage result:', result);
    return result;
  }

  /**
   * Returns a full poster image URL and which provider served it.
   * Falls back across providers based on user preference.
   */
  @Get('/image/:type')
  async getImage(
    @Param('type') type: 'movie' | 'show',
    @Query() query: Record<string, string>,
  ): Promise<{ url: string; provider: string } | undefined> {
    const ids = this.parseIds(query);
    if (!ids) return undefined;
    const providerType = type === 'show' ? 'tv' : 'movie';
    return this.metadata.getPosterUrl(ids, providerType, 'w300_and_h450_face');
  }
}
