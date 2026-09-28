import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { OmbiApiService } from './ombi-api.service';

const REQUEST_TYPES = ['movie', 'tv'] as const;

@Controller('api/ombi')
export class OmbiApiController {
  constructor(private readonly ombiApi: OmbiApiService) {}

  /** Who requested a title; `season` and `episode` narrow it within a show. */
  @Get('requests/:tmdbId/users')
  getRequestedByUsernames(
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
    @Query('type', new ParseEnumPipe(REQUEST_TYPES))
    type: (typeof REQUEST_TYPES)[number],
    @Query('season', new ParseIntPipe({ optional: true })) season?: number,
    @Query('episode', new ParseIntPipe({ optional: true })) episode?: number,
  ): Promise<string[]> {
    return this.ombiApi.getRequestedByUsernames(tmdbId, type, season, episode);
  }
}
