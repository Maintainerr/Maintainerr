import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { MetadataService } from './metadata.service';

/**
 * HTTP controller for metadata endpoints.
 * All metadata flows through MetadataService which handles provider preference.
 */
@Controller('api/moviedb')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  /**
   * Returns a full backdrop image URL (not just a TMDB path).
   * Falls back across providers based on user preference.
   */
  @Get('/backdrop/:type/:tmdbId')
  async getBackdropImage(
    @Param('tmdbId', new ParseIntPipe()) tmdbId: number,
    @Param('type') type: 'movie' | 'show',
  ): Promise<string | undefined> {
    const providerType = type === 'show' ? 'tv' : 'movie';
    return this.metadata.getBackdropUrl({ tmdbId }, providerType, 'w1280');
  }

  /**
   * Returns a full poster image URL (not just a TMDB path).
   * Falls back across providers based on user preference.
   */
  @Get('/image/:type/:tmdbId')
  async getImage(
    @Param('tmdbId', new ParseIntPipe()) tmdbId: number,
    @Param('type') type: 'movie' | 'show',
  ): Promise<string | undefined> {
    const providerType = type === 'show' ? 'tv' : 'movie';
    return this.metadata.getPosterUrl(
      { tmdbId },
      providerType,
      'w300_and_h450_face',
    );
  }
}
