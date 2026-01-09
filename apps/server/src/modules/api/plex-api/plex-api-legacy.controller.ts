/**
 * @deprecated This controller provides backward compatibility for the /api/plex endpoints.
 * New integrations should use /api/media-server instead.
 *
 * This entire file can be deleted when legacy support is no longer needed.
 * To remove: Delete this file and remove PlexApiLegacyController from plex-api.module.ts
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MediaServerFactory } from '../media-server/media-server.factory';
import { MediaServerSetupGuard } from '../media-server/guards/media-server-setup.guard';
import { PlexMapper } from '../media-server/plex/plex.mapper';
import { CollectionHubSettingsDto } from './dto/collection-hub-settings.dto';
import { CreateUpdateCollection } from './interfaces/collection.interface';

/**
 * Interceptor that adds deprecation warning header to all responses
 */
@Injectable()
class DeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        response.setHeader(
          'X-Deprecated',
          'This endpoint is deprecated. Use /api/media-server instead.',
        );
        response.setHeader('Deprecation', 'true');
        response.setHeader(
          'Link',
          '</api/media-server>; rel="successor-version"',
        );
      }),
    );
  }
}

/**
 * @deprecated Legacy Plex API Controller
 *
 * Provides backward compatibility for external integrations using the old /api/plex endpoints.
 * All endpoints delegate to the MediaServerFactory abstraction layer.
 *
 * WARNING: This controller is deprecated and will be removed in a future major version.
 * Please migrate to /api/media-server endpoints.
 */
@Controller('api/plex')
@UseGuards(MediaServerSetupGuard)
@UseInterceptors(DeprecationInterceptor)
export class PlexApiLegacyController {
  constructor(private readonly mediaServerFactory: MediaServerFactory) {}

  /** @deprecated Use GET /api/media-server instead */
  @Get()
  async getStatus() {
    const mediaServer = await this.mediaServerFactory.getService();
    const status = await mediaServer.getStatus();
    if (status == null) {
      throw new InternalServerErrorException('Could not fetch Plex status');
    }
    return status;
  }

  /** @deprecated Use GET /api/media-server/libraries instead */
  @Get('libraries')
  async getLibraries() {
    const mediaServer = await this.mediaServerFactory.getService();
    const libraries = await mediaServer.getLibraries();
    if (libraries == null) {
      throw new InternalServerErrorException('Could not fetch Plex libraries');
    }
    return libraries;
  }

  /** @deprecated Use GET /api/media-server/library/:id/content?page=X&limit=Y instead */
  @Get('library/:id/content/:page')
  async getLibraryContent(
    @Param('id') id: string,
    @Param('page', ParseIntPipe) page: number,
    @Query('amount') amount?: number,
  ) {
    const mediaServer = await this.mediaServerFactory.getService();
    const size = amount ?? 50;
    const offset = (page - 1) * size;
    const result = await mediaServer.getLibraryContents(id, {
      offset,
      limit: size,
    });
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex library contents',
      );
    }
    return result;
  }

  /** @deprecated Use GET /api/media-server/library/:id/content/search/:query instead */
  @Get('library/:id/content/search/:query')
  async searchLibraryContent(
    @Param('id') id: string,
    @Param('query') query: string,
    @Query('type') type?: string,
  ) {
    const mediaServer = await this.mediaServerFactory.getService();
    const result = await mediaServer.searchLibraryContents(id, query, type as any);
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not search Plex library contents',
      );
    }
    return result;
  }

  /** @deprecated Use GET /api/media-server/meta/:id instead */
  @Get('meta/:id')
  async getMetadata(@Param('id') id: string) {
    const mediaServer = await this.mediaServerFactory.getService();
    const result = await mediaServer.getMetadata(id);
    if (result == null) {
      throw new InternalServerErrorException('Could not fetch Plex metadata');
    }
    return result;
  }

  /** @deprecated Use GET /api/media-server/meta/:id/seen instead */
  @Get('meta/:id/seen')
  async getSeenBy(@Param('id') id: string) {
    const mediaServer = await this.mediaServerFactory.getService();
    const result = await mediaServer.getWatchHistory(id);
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex watch history',
      );
    }
    return result;
  }

  /** @deprecated Use GET /api/media-server/users instead */
  @Get('users')
  async getUsers() {
    const mediaServer = await this.mediaServerFactory.getService();
    const result = await mediaServer.getUsers();
    if (result == null) {
      throw new InternalServerErrorException('Could not fetch Plex users');
    }
    return result;
  }

  /** @deprecated Use GET /api/media-server/meta/:id/children instead */
  @Get('meta/:id/children')
  async getChildrenMetadata(@Param('id') id: string) {
    const mediaServer = await this.mediaServerFactory.getService();
    const result = await mediaServer.getChildrenMetadata(id);
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex children metadata',
      );
    }
    return result;
  }

  /** @deprecated Use GET /api/media-server/library/:id/recent instead */
  @Get('library/:id/recent')
  async getRecentlyAdded(@Param('id') id: string) {
    const mediaServer = await this.mediaServerFactory.getService();
    const result = await mediaServer.getRecentlyAdded(id);
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch recently added items',
      );
    }
    return result;
  }

  /** @deprecated Use GET /api/media-server/library/:id/collections instead */
  @Get('library/:id/collections')
  async getCollections(@Param('id') id: string) {
    const mediaServer = await this.mediaServerFactory.getService();
    const collections = await mediaServer.getCollections(id);
    if (collections == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex collections',
      );
    }
    return collections;
  }

  /** @deprecated Use GET /api/media-server/collection/:id instead */
  @Get('library/collection/:collectionId')
  async getCollection(
    @Param('collectionId') collectionId: string,
  ) {
    const mediaServer = await this.mediaServerFactory.getService();
    const collection = await mediaServer.getCollection(collectionId);
    if (collection == null) {
      throw new InternalServerErrorException('Could not fetch Plex collection');
    }
    return collection;
  }

  /** @deprecated Use GET /api/media-server/collection/:id/children instead */
  @Get('library/collection/:collectionId/children')
  async getCollectionChildren(
    @Param('collectionId') collectionId: string,
  ) {
    const mediaServer = await this.mediaServerFactory.getService();
    const children = await mediaServer.getCollectionChildren(collectionId);
    if (children == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex collection children',
      );
    }
    return children;
  }

  /** @deprecated Use GET /api/media-server/search/:query instead */
  @Get('search/:input')
  async searchLibrary(@Param('input') input: string) {
    const mediaServer = await this.mediaServerFactory.getService();
    const result = await mediaServer.searchContent(input);
    if (result == null) {
      throw new InternalServerErrorException('Could not search Plex library');
    }
    return result;
  }

  /** @deprecated Use PUT /api/media-server/collection/:collectionId/item/:itemId instead */
  @Put('library/collection/:collectionId/child/:childId')
  async addChildToCollection(
    @Param('collectionId') collectionId: string,
    @Param('childId') childId: string,
  ) {
    const mediaServer = await this.mediaServerFactory.getService();
    await mediaServer.addToCollection(collectionId, childId);
    // Return format compatible with old API
    return { status: 'OK', message: 'Item added to collection' };
  }

  /** @deprecated Use DELETE /api/media-server/collection/:collectionId/item/:itemId instead */
  @Delete('library/collection/:collectionId/child/:childId')
  async deleteChildFromCollection(
    @Param('collectionId') collectionId: string,
    @Param('childId') childId: string,
  ) {
    const mediaServer = await this.mediaServerFactory.getService();
    await mediaServer.removeFromCollection(collectionId, childId);
    return { status: 'OK', message: 'Item removed from collection' };
  }

  /** @deprecated Use PUT /api/media-server/collection instead */
  @Put('library/collection/update')
  async updateCollection(@Body() body: CreateUpdateCollection) {
    const mediaServer = await this.mediaServerFactory.getService();
    const collection = await mediaServer.updateCollection({
      libraryId: body.libraryId?.toString() ?? '',
      collectionId: body.collectionId?.toString() ?? '',
      title: body.title,
      summary: body.summary,
      sortTitle: body.sortTitle,
    });
    if (collection == null) {
      throw new InternalServerErrorException(
        'Could not update Plex collection',
      );
    }
    return collection;
  }

  /** @deprecated Use POST /api/media-server/collection instead */
  @Post('library/collection/create')
  async createCollection(@Body() body: CreateUpdateCollection) {
    const mediaServer = await this.mediaServerFactory.getService();
    const collection = await mediaServer.createCollection({
      libraryId: body.libraryId?.toString() ?? '',
      title: body.title ?? '',
      summary: body.summary,
      type: PlexMapper.plexDataTypeToMediaItemType(body.type),
      sortTitle: body.sortTitle,
    });
    if (collection == null) {
      throw new InternalServerErrorException(
        'Could not create Plex collection',
      );
    }
    return collection;
  }

  /** @deprecated Use DELETE /api/media-server/collection/:id instead */
  @Delete('library/collection/:collectionId')
  async deleteCollection(@Param('collectionId') collectionId: string) {
    const mediaServer = await this.mediaServerFactory.getService();
    await mediaServer.deleteCollection(collectionId);
    return { status: 'OK', message: 'Collection deleted' };
  }

  /** @deprecated Use PUT /api/media-server/collection/visibility instead */
  @Put('library/collection/settings')
  async updateCollectionSettings(@Body() body: CollectionHubSettingsDto) {
    if (
      body.libraryId &&
      body.collectionId &&
      body.recommended !== undefined &&
      body.sharedHome !== undefined &&
      body.ownHome !== undefined
    ) {
      const mediaServer = await this.mediaServerFactory.getService();
      await mediaServer.updateCollectionVisibility({
        libraryId: body.libraryId.toString(),
        collectionId: body.collectionId.toString(),
        recommended: body.recommended,
        ownHome: body.ownHome,
        sharedHome: body.sharedHome,
      });
      return { status: 'OK', message: 'Collection settings updated' };
    } else {
      return 'Incorrect input parameters supplied.';
    }
  }
}
