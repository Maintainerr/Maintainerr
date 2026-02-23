import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';
import { MetadataService } from './metadata.service';

/**
 * HTTP controller for metadata endpoints.
 * Keeps backward-compatible /api/moviedb routes but returns full image URLs.
 */
@Controller('api/moviedb')
export class MetadataController {
  constructor(
    private readonly metadata: MetadataService,
    private readonly tmdbApi: TmdbApiService,
  ) {}

  @Get('/person/:personId')
  getPerson(@Param('personId', new ParseIntPipe()) personId: number) {
    return this.tmdbApi.getPerson({ personId });
  }

  @Get('/movie/imdb/:id')
  getMovie(@Param('id') imdbId: string) {
    return this.tmdbApi.getByExternalId({
      externalId: imdbId,
      type: 'imdb',
    });
  }

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
