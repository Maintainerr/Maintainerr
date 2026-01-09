import {
  CollectionVisibilitySettings,
  CreateCollectionParams,
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaLibrary,
  MediaServerStatus,
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
  Logger,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MediaServerSetupGuard } from './guards';
import { MediaServerFactory } from './media-server.factory';

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
  private readonly logger = new Logger(MediaServerController.name);

  constructor(private readonly mediaServerFactory: MediaServerFactory) {}

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

  @Get('library/:id/content')
  async getLibraryContent(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: MediaItemType,
  ): Promise<PagedResult<MediaItem>> {
    const mediaServer = await this.mediaServerFactory.getService();
    const pageNum = page ?? 1;
    const size = limit ?? 50;
    const offset = (pageNum - 1) * size;

    return await mediaServer.getLibraryContents(id, {
      offset,
      limit: size,
      type,
    });
  }

  @Get('library/:id/content/search/:query')
  async searchLibraryContent(
    @Param('id') id: string,
    @Param('query') query: string,
    @Query('type') type?: MediaItemType,
  ): Promise<MediaItem[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    return mediaServer.searchLibraryContents(id, query, type);
  }

  @Get('library/:id/recent')
  async getRecentlyAdded(
    @Param('id') id: string,
    @Query('limit') limit?: number,
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
    return mediaServer.searchContent(query);
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
