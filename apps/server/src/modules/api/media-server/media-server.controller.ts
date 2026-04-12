import {
  CollectionVisibilitySettings,
  compareMediaItemsBySort,
  CreateCollectionParams,
  MaintainerrMediaStatusDetails,
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaItemWithParent,
  MediaLibrary,
  MediaLibrarySortField,
  mediaLibrarySortFields,
  mediaLibraryStatusSortFields,
  MediaServerStatus,
  MediaSortOrder,
  mediaSortOrders,
  MediaUser,
  PagedResult,
  UpdateCollectionParams,
  WatchRecord,
  type MediaLibraryStatusSortField,
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
  ServiceUnavailableException,
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
const maintainerrServerSortBatchSize = 250;
const maintainerrServerSortWarnThreshold = 5000;
// ~2KB per MediaItem in V8 heap. 15,000 items ≈ 60MB with sort copy overhead.
const maintainerrServerSortHardCap = 15000;

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

  private isStatusLibrarySort(sort?: MediaLibrarySortField): boolean {
    return (
      sort != null &&
      mediaLibraryStatusSortFields.includes(sort as MediaLibraryStatusSortField)
    );
  }

  private async getLibraryContentPage(
    mediaServer: IMediaServerService,
    {
      libraryId,
      offset,
      limit,
      type,
      sort,
      sortOrder,
    }: {
      libraryId: string;
      offset: number;
      limit: number;
      type?: MediaItemType;
      sort?: MediaLibrarySortField;
      sortOrder?: MediaSortOrder;
    },
  ): Promise<PagedResult<MediaItem>> {
    if (!this.isStatusLibrarySort(sort)) {
      const result = await mediaServer.getLibraryContents(libraryId, {
        offset,
        limit,
        type,
        sort,
        sortOrder,
      });

      return {
        ...result,
        items: await this.enrichItems(result.items),
      };
    }

    const allItems: MediaItem[] = [];
    let nextOffset = 0;
    let totalSize = 0;

    while (nextOffset === 0 || allItems.length < totalSize) {
      const result = await mediaServer.getLibraryContents(libraryId, {
        offset: nextOffset,
        limit: maintainerrServerSortBatchSize,
        type,
        sort: 'title',
        sortOrder: 'asc',
      });

      totalSize = result.totalSize;

      if (nextOffset === 0 && totalSize > maintainerrServerSortWarnThreshold) {
        this.logger.warn(
          `Status-sorted library request for ${libraryId} (${sort}.${sortOrder ?? 'asc'}) requires fetching ${totalSize} items before paging.`,
        );
      }

      if (!result.items.length) {
        break;
      }

      allItems.push(...result.items);
      nextOffset += result.items.length;

      if (allItems.length >= maintainerrServerSortHardCap) {
        this.logger.warn(
          `Status-sorted library request for ${libraryId} hit the ${maintainerrServerSortHardCap} item cap (library has ${totalSize} items). Results will be partial.`,
        );
        break;
      }
    }

    const enrichedItems = await this.enrichItems(allItems);
    const sortedItems = [...enrichedItems].sort((leftItem, rightItem) =>
      compareMediaItemsBySort(leftItem, rightItem, sort, sortOrder),
    );

    return {
      items: sortedItems.slice(offset, offset + limit),
      totalSize: sortedItems.length,
      offset,
      limit,
    };
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
    const libraries = await mediaServer.getLibraries();

    // Distinguish "server unreachable" from "server healthy but no libraries".
    // Adapters swallow upstream failures and return []; without this check the
    // UI would render as though the media server has zero libraries, hiding
    // any rule groups referencing a stored libraryId.
    if (libraries.length === 0 && mediaServer.isSetup()) {
      const status = await mediaServer.getStatus();
      if (!status) {
        throw new ServiceUnavailableException(
          'Media server is configured but unreachable. Library list unavailable.',
        );
      }
    }

    return libraries;
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

    const content = await this.getLibraryContentPage(mediaServer, {
      libraryId: selectedLibrary.id,
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
    return await this.getLibraryContentPage(mediaServer, {
      libraryId: id,
      offset,
      limit: size,
      type,
      sort,
      sortOrder,
    });
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

  @Get('meta/:id/maintainerr-status')
  async getMaintainerrStatusDetails(
    @Param('id') id: string,
  ): Promise<MaintainerrMediaStatusDetails> {
    const mediaServer = await this.mediaServerFactory.getService();
    const metadata = await mediaServer.getMetadata(id);

    if (!metadata) {
      this.logger.warn(
        `Metadata was not found for media item ${id}; Maintainerr status details may omit parent-level exclusions.`,
      );
    }

    return await this.mediaItemEnrichmentService.getMaintainerrStatusDetails(
      metadata
        ? {
            id: metadata.id,
            parentId: metadata.parentId,
            grandparentId: metadata.grandparentId,
          }
        : { id },
    );
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
