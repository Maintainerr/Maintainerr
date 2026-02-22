import { Controller, Delete, Get, Param } from '@nestjs/common';
import { SeerrApiService } from './seerr-api.service';

@Controller(['api/seerr', 'api/overseerr', 'api/jellyseerr'])
export class SeerrApiController {
  constructor(private readonly seerrApi: SeerrApiService) {}

  @Get('movie/:id')
  getMovie(@Param('id') id: string) {
    return this.seerrApi.getMovie(id);
  }

  @Get('show/:id')
  getShow(@Param('id') id: string) {
    return this.seerrApi.getShow(id);
  }

  @Delete('request/:requestId')
  deleteRequest(@Param('requestId') requestId: string) {
    return this.seerrApi.deleteRequest(requestId);
  }

  @Delete('media/:mediaId')
  deleteMedia(@Param('mediaId') mediaId: string) {
    return this.seerrApi.deleteMediaItem(mediaId);
  }

  @Delete('media/tmdb/:mediaId')
  removeMediaByTmdbId(@Param('mediaId') mediaId: string) {
    return this.seerrApi.removeMediaByTmdbId(mediaId, 'movie');
  }
}
