import { Controller, Delete, Get, Param } from '@nestjs/common';
import { OverseerrApiService } from './overseerr-api.service';

@Controller('api/overseerr')
export class OverseerrApiController {
  constructor(private readonly overseerApi: OverseerrApiService) {}

  @Get('movie/:id')
  getMovie(@Param('id') id: string) {
    return this.overseerApi.getMovie(id);
  }

  @Get('show/:id')
  getShow(@Param('id') id: string) {
    return this.overseerApi.getShow(id);
  }

  @Delete('request/:requestId')
  deleteRequest(@Param('requestId') requestId: string) {
    return this.overseerApi.deleteRequest(requestId);
  }

  @Delete('media/:mediaId')
  deleteMedia(@Param('mediaId') mediaId: string) {
    return this.overseerApi.deleteMediaItem(mediaId);
  }
  @Delete('media/tmdb/:mediaId')
  removeMediaByTmdbId(@Param('mediaId') mediaId: string) {
    return this.overseerApi.removeMediaByTmdbId(mediaId, 'movie');
  }
}
