import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { TmdbApiService } from './tmdb.service';

@Controller('api/moviedb')
export class TmdbApiController {
  constructor(private readonly movieDbApi: TmdbApiService) {}

  @Get('/person/:personId')
  getPerson(@Param('personId', new ParseIntPipe()) personId: number) {
    return this.movieDbApi.getPerson({ personId: personId });
  }
  @Get('/movie/imdb/:id')
  getMovie(@Param('id') imdbId: string) {
    return this.movieDbApi.getByExternalId({
      externalId: imdbId,
      type: 'imdb',
    });
  }
  @Get('/backdrop/:type/:tmdbId')
  getBackdropImage(
    @Param('tmdbId', new ParseIntPipe()) tmdbId: number,
    @Param('type') type: 'movie' | 'show',
  ) {
    return this.movieDbApi.getBackdropImagePath({ tmdbId: tmdbId, type: type });
  }
  @Get('/image/:type/:tmdbId')
  getImage(
    @Param('tmdbId', new ParseIntPipe()) tmdbId: number,
    @Param('type') type: 'movie' | 'show',
  ) {
    return this.movieDbApi.getImagePath({ tmdbId: tmdbId, type: type });
  }
}
