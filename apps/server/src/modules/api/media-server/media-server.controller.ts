import {
  CollectionVisibilitySettings,
  CreateCollectionParams,
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaItemWithParent,
  MediaLibrary,
  MediaLibrarySortField,
  mediaLibrarySortFields,
  MediaServerStatus,
  MediaSortOrder,
  mediaSortOrders,
  MediaUser,
  PagedResult,
  UpdateCollectionParams,
  WatchRecord,
} from '@maintainerr/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MediaServerSetupGuard } from './guards';
import { MediaItemEnrichmentService } from './media-item-enrichment.service';
import { MediaServerFactory } from './media-server.factory';
import { IMediaServerService } from './media-server.interface';

const mediaLibrarySortQuerySchema = z.enum(mediaLibrarySortFields).optional();
const mediaSortOrderQuerySchema = z.enum(mediaSortOrders).optional();

interface OverviewBootstrapResult {
  libraries: MediaLibrary[];
  selectedLibraryId?: string;
  content: PagedResult<MediaItem>;
}

/**
 * Unified Media Server Controller
 *
 * Provides a single API endpoint for media server operations,
 * abstracting away the underlying implementation (Plex, Jellyfin, etc.)
 *
 * All endpoints use the configured media server via MediaServerFactory.
 */
@Controller('api/media-server')
@UseGuards(MediaServerSetupGuard)
export class MediaServerController {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly logger: MaintainerrLogger,
    private readonly mediaItemEnrichmentService: MediaItemEnrichmentService,
  ) {
    this.logger.setContext(MediaServerController.name);
  }

  private async attachParentMetadata(
    items: MediaItem[],
    mediaServer: IMediaServerService,
  ): Promise<MediaItem[]> {
    return await Promise.all(
      items.map(async (item) => {
        if (!['season', 'episode'].includes(item.type)) {
          return item;
        }

        const parentItem = item.grandparentId
          ? await mediaServer.getMetadata(item.grandparentId)
          : item.parentId
            ? await mediaServer.getMetadata(item.parentId)
            : undefined;

        return {
          ...item,
          parentItem,
        } satisfies MediaItemWithParent;
      }),
    );
  }

  private async enrichItems(items: MediaItem[]): Promise<MediaItem[]> {
    return await this.mediaItemEnrichmentService.enrichItems(items);
  }

  private async enrichAndAttachParentMetadata(
    items: MediaItem[],
    mediaServer: IMediaServerService,
  ): Promise<MediaItem[]> {
    const enrichedItems = await this.enrichItems(items);
    return await this.attachParentMetadata(enrichedItems, mediaServer);
  }

  @Get()
  async getStatus(): Promise<MediaServerStatus | undefined> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getStatus();
  }

  @Get('type')
  async getServerType(): Promise<{ type: string }> {
    const mediaServer = await this.mediaServerFactory.getService();
    return { type: mediaServer.getServerType() };
  }

  @Get('libraries')
  async getLibraries(): Promise<MediaLibrary[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    return await mediaServer.getLibraries();
  }

  @Get('overview/bootstrap')
  async getOverviewBootstrap(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('sort', new ZodValidationPipe(mediaLibrarySortQuerySchema))
    sort?: MediaLibrarySortField,
    @Query('sortOrder', new ZodValidationPipe(mediaSortOrderQuerySchema))
    sortOrder?: MediaSortOrder,
  ): Promise<OverviewBootstrapResult> {
    const mediaServer = await this.mediaServerFactory.getService();
    const libraries = await mediaServer.getLibraries();
    const selectedLibrary = libraries[0];
    const size = limit ?? 50;

    if (!selectedLibrary) {
      return {
        libraries,
        selectedLibraryId: undefined,
        content: {
          items: [],
          totalSize: 0,
          offset: 0,
          limit: size,
        },
      };
    }

    const content = await mediaServer.getLibraryContents(selectedLibrary.id, {
      offset: 0,
      limit: size,
      type: selectedLibrary.type,
      sort,
      sortOrder,
    });

    return {
      libraries,
      selectedLibraryId: selectedLibrary.id,
      content: {
        ...content,
        items: await this.enrichItems(content.items),
      },
    };
  }

  @Get('library/:id/content')
  async getLibraryContent(
    @Param('id') id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('type') type?: MediaItemType,
    @Query('sort', new ZodValidationPipe(mediaLibrarySortQuerySchema))
    sort?: MediaLibrarySortField,
    @Query('sortOrder', new ZodValidationPipe(mediaSortOrderQuerySchema))
    sortOrder?: MediaSortOrder,
  ): Promise<PagedResult<MediaItem>> {
    const mediaServer = await this.mediaServerFactory.getService();
    const pageNum = Math.max(page ?? 1, 1);
    const size = limit ?? 50;
    const offset = (pageNum - 1) * size;
    const result = await mediaServer.getLibraryContents(id, {
      offset,
      limit: size,
      type,
      sort,
      sortOrder,
    });

    return {
      ...result,
      items: await this.enrichItems(result.items),
    };
  }

  @Get('library/:id/content/search/:query')
  async searchLibraryContent(
    @Param('id') id: string,
    @Param('query') query: string,
    @Query('type') type?: MediaItemType,
  ): Promise<MediaItem[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    const items = await mediaServer.searchLibraryContents(id, query, type);
    return await this.enrichAndAttachParentMetadata(items, mediaServer);
  }

  @Get('library/:id/recent')
  async getRecentlyAdded(
    @Param('id') id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<MediaItem[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getRecentlyAdded(id, { limit });
  }

  @Get('users')
  async getUsers(): Promise<MediaUser[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getUsers();
  }

  @Get('user/:id')
  async getUser(@Param('id') id: string): Promise<MediaUser | undefined> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getUser(id);
  }

  @Get('meta/:id')
  async getMetadata(@Param('id') id: string): Promise<MediaItem | undefined> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getMetadata(id);
  }

  @Get('meta/:id/children')
  async getChildrenMetadata(@Param('id') id: string): Promise<MediaItem[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getChildrenMetadata(id);
  }

  @Get('meta/:id/seen')
  async getWatchHistory(@Param('id') id: string): Promise<WatchRecord[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getWatchHistory(id);
  }

  @Get('search/:query')
  async searchContent(@Param('query') query: string): Promise<MediaItem[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    const items = await mediaServer.searchContent(query);
    return await this.enrichAndAttachParentMetadata(items, mediaServer);
  }

  @Get('library/:id/collections')
  async getCollections(@Param('id') id: string): Promise<MediaCollection[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getCollections(id);
  }

  @Get('collection/:id')
  async getCollection(
    @Param('id') id: string,
  ): Promise<MediaCollection | undefined> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getCollection(id);
  }

  @Get('collection/:id/children')
  async getCollectionChildren(@Param('id') id: string): Promise<MediaItem[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.getCollectionChildren(id);
  }

  @Post('collection')
  async createCollection(
    @Body() params: CreateCollectionParams,
  ): Promise<MediaCollection> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.createCollection(params);
  }

  @Delete('collection/:id')
  async deleteCollection(@Param('id') id: string): Promise<void> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.deleteCollection(id);
  }

  @Put('collection/:collectionId/item/:itemId')
  async addToCollection(
    @Param('collectionId') collectionId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.addToCollection(collectionId, itemId);
  }

  @Delete('collection/:collectionId/item/:itemId')
  async removeFromCollection(
    @Param('collectionId') collectionId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.removeFromCollection(collectionId, itemId);
  }

  // COLLECTION METADATA & VISIBILITY
  // These operations may not be supported on all media servers

  /**
   * Update a collection's metadata (title, summary, etc.)
   * @remarks Currently only supported on Plex - throws error for Jellyfin
   */
  @Put('collection')
  async updateCollection(
    @Body() params: UpdateCollectionParams,
  ): Promise<MediaCollection> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.updateCollection(params);
  }

  /**
   * Update a collection's visibility/hub settings (recommended, home screen, etc.)
   * @remarks Currently only supported on Plex - throws error for Jellyfin
   */
  @Put('collection/visibility')
  async updateCollectionVisibility(
    @Body() settings: CollectionVisibilitySettings,
  ): Promise<void> {
    if (
      !settings.libraryId ||
      !settings.collectionId ||
      (settings.recommended === undefined &&
        settings.ownHome === undefined &&
        settings.sharedHome === undefined)
    ) {
      throw new BadRequestException(
        'libraryId, collectionId, and at least one visibility setting are required.',
      );
    }
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.updateCollectionVisibility(settings);
  }
}
