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

  /** Who requested a title; `season` narrows it to one season of a show. */
  @Get('requests/:tmdbId/users')
  getRequestedByUsernames(
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
    @Query('type', new ParseEnumPipe(REQUEST_TYPES))
    type: (typeof REQUEST_TYPES)[number],
    @Query('season', new ParseIntPipe({ optional: true })) season?: number,
  ): Promise<string[]> {
    return this.ombiApi.getRequestedByUsernames(tmdbId, type, season);
  }
}
