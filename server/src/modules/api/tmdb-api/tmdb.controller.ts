import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import { Response } from 'express';
import { TmdbApiService } from './tmdb.service';

@Controller('api/moviedb')
export class TmdbApiController {
  constructor(private readonly movieDbApi: TmdbApiService) {}

  @Get('/person/:personId')
  getPerson(@Param('personId', new ParseIntPipe()) personId: number) {
    return this.movieDbApi.getPerson({ personId: personId });
  }
  @Get('/movie/imdb/:id')
  getMovie(@Param('id') imdbId: number) {
    return this.movieDbApi.getByExternalId({
      externalId: imdbId.toString(),
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
  streamImage(
    @Param('tmdbId', new ParseIntPipe()) tmdbId: number,
    @Param('type') type: 'movie' | 'show',
    @Res() res: Response,
  ) {
    return this.movieDbApi.streamImage(tmdbId, type, res);
  }
}
