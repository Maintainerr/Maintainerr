import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { MetadataService } from './metadata.service';

/**
 * HTTP controller for metadata endpoints.
 * All metadata flows through MetadataService which handles provider preference.
 *
 * The `provider` query param (default: 'tmdb') tells the controller which
 * provider the supplied `:id` belongs to, keeping the controller agnostic.
 */
@Controller('api/metadata')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  private buildIds(
    id: number,
    provider: string,
  ): { tmdbId?: number; tvdbId?: number } {
    return provider === 'tvdb' ? { tvdbId: id } : { tmdbId: id };
  }

  /**
   * Returns a full backdrop image URL.
   * Falls back across providers based on user preference.
   */
  @Get('/backdrop/:type/:id')
  async getBackdropImage(
    @Param('id', new ParseIntPipe()) id: number,
    @Param('type') type: 'movie' | 'show',
    @Query('provider') provider = 'tmdb',
  ): Promise<string | undefined> {
    const providerType = type === 'show' ? 'tv' : 'movie';
    return this.metadata.getBackdropUrl(
      this.buildIds(id, provider),
      providerType,
    );
  }

  /**
   * Returns a full poster image URL.
   * Falls back across providers based on user preference.
   */
  @Get('/image/:type/:id')
  async getImage(
    @Param('id', new ParseIntPipe()) id: number,
    @Param('type') type: 'movie' | 'show',
    @Query('provider') provider = 'tmdb',
  ): Promise<string | undefined> {
    const providerType = type === 'show' ? 'tv' : 'movie';
    return this.metadata.getPosterUrl(
      this.buildIds(id, provider),
      providerType,
      'w300_and_h450_face',
    );
  }
}
