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
   * Extract provider ID query params into a ProviderIds map.
   * Accepts params like ?tmdbId=123&tvdbId=456 and normalises keys
   * to lowercase provider names (tmdb, tvdb) matching provider idKey.
   */
  private parseIds(
    query: Record<string, string>,
  ): Record<string, string | number> | undefined {
    const ids: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(query)) {
      if (!key.endsWith('Id') || !value) continue;
      const normalizedKey = key.slice(0, -2).toLowerCase();
      const num = +value;
      ids[normalizedKey] = Number.isFinite(num) ? num : value;
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
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    const ids = this.parseIds(query);
    if (!ids) return undefined;
    const providerType = type === 'show' ? 'tv' : 'movie';
    return this.metadata.getBackdropUrl(ids, providerType);
  }

  /**
   * Returns a full poster image URL and which provider served it.
   * Falls back across providers based on user preference.
   */
  @Get('/image/:type')
  async getImage(
    @Param('type') type: 'movie' | 'show',
    @Query() query: Record<string, string>,
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    const ids = this.parseIds(query);
    if (!ids) return undefined;
    const providerType = type === 'show' ? 'tv' : 'movie';
    return this.metadata.getPosterUrl(ids, providerType, 'w300_and_h450_face');
  }
}
