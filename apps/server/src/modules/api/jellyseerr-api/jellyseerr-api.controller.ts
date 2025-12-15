import { Controller, Delete, Get, Param } from '@nestjs/common';
import { JellyseerrApiService } from './jellyseerr-api.service';

@Controller('api/jellyseerr')
export class JellyseerrApiController {
  constructor(private readonly jellyseerrApi: JellyseerrApiService) {}

  @Get('movie/:id')
  getMovie(@Param('id') id: string) {
    return this.jellyseerrApi.getMovie(id);
  }

  @Get('show/:id')
  getShow(@Param('id') id: string) {
    return this.jellyseerrApi.getShow(id);
  }

  @Delete('request/:requestId')
  deleteRequest(@Param('requestId') requestId: string) {
    return this.jellyseerrApi.deleteRequest(requestId);
  }

  @Delete('media/:mediaId')
  deleteMedia(@Param('mediaId') mediaId: string) {
    return this.jellyseerrApi.deleteMediaItem(mediaId);
  }
  @Delete('media/tmdb/:mediaId')
  removeMediaByTmdbId(@Param('mediaId') mediaId: string) {
    return this.jellyseerrApi.removeMediaByTmdbId(mediaId, 'movie');
  }
}
