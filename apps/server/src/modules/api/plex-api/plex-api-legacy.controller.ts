/**
 * @deprecated This controller provides backward compatibility for the /api/plex endpoints.
 * New integrations should use /api/media-server instead.
 *
 * This entire file can be deleted when legacy support is no longer needed.
 * To remove: Delete this file and remove PlexApiLegacyController from plex-api.module.ts
 */
import {
  BasicResponseDto,
  MediaCollection,
  MediaItem,
  MediaLibrary,
  MediaProviderIds,
  MediaRating,
  MediaServerStatus,
  MediaSource,
  MediaUser,
  WatchRecord,
} from '@maintainerr/contracts';
import {
  Body,
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Injectable,
  InternalServerErrorException,
  NestInterceptor,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MediaServerSetupGuard } from '../media-server/guards/media-server-setup.guard';
import { MediaServerFactory } from '../media-server/media-server.factory';
import { IMediaServerService } from '../media-server/media-server.interface';
import { PlexMapper } from '../media-server/plex/plex.mapper';
import { CollectionHubSettingsDto } from './dto/collection-hub-settings.dto';
import {
  CreateUpdateCollection,
  PlexCollection,
} from './interfaces/collection.interface';
import {
  PlexActor,
  PlexGenre,
  PlexHub,
  PlexLibrary,
  PlexLibraryItem,
  PlexSeenBy,
  PlexUserAccount,
} from './interfaces/library.interfaces';
import { Media as PlexMedia, PlexMetadata } from './interfaces/media.interface';

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
 * All compatibility translation stays in this file so it can be removed cleanly.
 *
 * WARNING: This controller is deprecated and will be removed in a future major version.
 * Please migrate to /api/media-server endpoints.
 */
@Controller('api/plex')
@UseGuards(MediaServerSetupGuard)
@UseInterceptors(DeprecationInterceptor)
export class PlexApiLegacyController {
  constructor(private readonly mediaServerFactory: MediaServerFactory) {}

  private async executeLegacyRequest<T>(
    handler: (mediaServer: IMediaServerService) => Promise<T>,
  ): Promise<T> {
    const mediaServer = await this.mediaServerFactory.getService();
    return handler(mediaServer);
  }

  private toUnixTimestamp(date?: Date): number {
    return date ? Math.floor(new Date(date).getTime() / 1000) : 0;
  }

  private toLegacyGuids(providerIds: MediaProviderIds): { id: string }[] {
    return [
      ...(providerIds.imdb ?? []).map((id) => ({ id: `imdb://${id}` })),
      ...(providerIds.tmdb ?? []).map((id) => ({ id: `tmdb://${id}` })),
      ...(providerIds.tvdb ?? []).map((id) => ({ id: `tvdb://${id}` })),
    ];
  }

  private toLegacyMediaSources(mediaSources: MediaSource[]): PlexMedia[] {
    return mediaSources.map((source) => ({
      id: Number(source.id) || 0,
      duration: source.duration ?? 0,
      bitrate: source.bitrate ?? 0,
      width: source.width ?? 0,
      height: source.height ?? 0,
      aspectRatio: source.aspectRatio ?? 0,
      audioChannels: source.audioChannels ?? 0,
      audioCodec: source.audioCodec ?? '',
      videoCodec: source.videoCodec ?? '',
      videoResolution: source.videoResolution ?? '',
      container: source.container ?? '',
      videoFrameRate: '',
      videoProfile: '',
      Part: undefined,
    }));
  }

  private toLegacyGenres(
    genres?: Array<{ id?: number | string; name: string }>,
  ): PlexGenre[] | undefined {
    return genres?.map((genre) => ({
      id: typeof genre.id === 'number' ? genre.id : 0,
      filter: genre.name,
      tag: genre.name,
    }));
  }

  private toLegacyActors(
    actors?: Array<{
      id?: number | string;
      name: string;
      role?: string;
      thumb?: string;
    }>,
  ): PlexActor[] | undefined {
    return actors?.map((actor) => ({
      id: typeof actor.id === 'number' ? actor.id : 0,
      filter: actor.name,
      tag: actor.name,
      role: actor.role ?? '',
      thumb: actor.thumb ?? '',
    }));
  }

  private getRatingValue(
    ratings: MediaRating[] | undefined,
    type: 'critic' | 'audience',
  ): number | undefined {
    return ratings?.find((rating) => rating.type === type)?.value;
  }

  private toLegacyLibraryItem(item: MediaItem): PlexLibraryItem {
    return {
      ratingKey: item.id,
      parentRatingKey: item.parentId,
      grandparentRatingKey: item.grandparentId,
      title: item.title,
      parentTitle: item.parentTitle,
      guid: item.guid,
      parentGuid: item.parentGuid,
      grandparentGuid: item.grandparentGuid,
      addedAt: this.toUnixTimestamp(item.addedAt),
      updatedAt: this.toUnixTimestamp(item.updatedAt),
      Guid: this.toLegacyGuids(item.providerIds),
      type: item.type,
      Media: this.toLegacyMediaSources(item.mediaSources),
      librarySectionTitle: item.library.title,
      librarySectionID: Number(item.library.id) || 0,
      librarySectionKey: item.library.id,
      summary: item.summary ?? '',
      viewCount: item.viewCount ?? 0,
      skipCount: item.skipCount ?? 0,
      lastViewedAt: this.toUnixTimestamp(item.lastViewedAt),
      year: item.year ?? 0,
      duration: item.durationMs ?? item.mediaSources[0]?.duration ?? 0,
      originallyAvailableAt: item.originallyAvailableAt
        ? new Date(item.originallyAvailableAt).toISOString().slice(0, 10)
        : '',
      rating: this.getRatingValue(item.ratings, 'critic'),
      audienceRating: this.getRatingValue(item.ratings, 'audience'),
      userRating: item.userRating,
      Genre: this.toLegacyGenres(item.genres),
      Role: this.toLegacyActors(item.actors),
      leafCount: item.childCount,
      viewedLeafCount: item.watchedChildCount,
      index: item.index,
      parentIndex: item.parentIndex,
      Collection: item.collections?.map((tag) => ({ tag })),
      Label: item.labels?.map((tag) => ({ tag })),
      contentRating: item.contentRating,
    };
  }

  private toLegacyMetadata(item: MediaItem): PlexMetadata {
    return {
      ratingKey: item.id,
      parentRatingKey: item.parentId,
      guid: item.guid,
      type: item.type,
      title: item.title,
      Guid: this.toLegacyGuids(item.providerIds),
      Children: undefined,
      index: item.index ?? 0,
      parentIndex: item.parentIndex,
      Collection: item.collections?.map((tag) => ({ tag })),
      leafCount: item.childCount ?? 0,
      grandparentRatingKey: item.grandparentId,
      viewedLeafCount: item.watchedChildCount ?? 0,
      addedAt: this.toUnixTimestamp(item.addedAt),
      updatedAt: this.toUnixTimestamp(item.updatedAt),
      media: this.toLegacyMediaSources(item.mediaSources),
      parentData: undefined,
      Label: item.labels?.map((tag) => ({ tag })),
      rating: this.getRatingValue(item.ratings, 'critic'),
      audienceRating: this.getRatingValue(item.ratings, 'audience'),
      userRating: item.userRating,
      Role: this.toLegacyActors(item.actors),
      originallyAvailableAt: item.originallyAvailableAt
        ? new Date(item.originallyAvailableAt).toISOString().slice(0, 10)
        : '',
      Media: this.toLegacyMediaSources(item.mediaSources),
      Genre: this.toLegacyGenres(item.genres),
      parentTitle: item.parentTitle,
      grandparentTitle: item.grandparentTitle,
      Rating: item.ratings?.map((rating) => ({
        image: rating.source,
        value: rating.value,
        type: rating.type ?? 'critic',
      })),
      contentRating: item.contentRating,
    };
  }

  private toLegacyCollection(collection: MediaCollection): PlexCollection {
    return {
      ratingKey: collection.id,
      key: `/library/collections/${collection.id}`,
      guid: collection.id,
      type: 'collection',
      title: collection.title,
      subtype: 'collection',
      summary: collection.summary ?? '',
      index: 0,
      ratingCount: 0,
      thumb: collection.thumb ?? '',
      addedAt: this.toUnixTimestamp(collection.addedAt),
      updatedAt: this.toUnixTimestamp(collection.updatedAt),
      childCount: String(collection.childCount ?? 0),
      maxYear: '',
      minYear: '',
      smart: collection.smart,
      sortTitle: undefined,
    };
  }

  private toLegacyLibrary(library: MediaLibrary): PlexLibrary {
    return {
      type: library.type,
      key: library.id,
      title: library.title,
      agent: library.agent ?? '',
    };
  }

  private toLegacyUser(user: MediaUser): PlexUserAccount {
    return {
      id: Number(user.id) || 0,
      key: user.id,
      name: user.name,
      defaultAudioLanguage: '',
      autoSelectAudio: true,
      defaultSubtitleLanguage: '',
      subtitleMode: 0,
      thumb: user.thumb ?? '',
    };
  }

  private toLegacySeenBy(record: WatchRecord): PlexSeenBy {
    return {
      ...this.toLegacyLibraryItem({
        id: record.itemId,
        title: '',
        guid: record.itemId,
        type: 'movie',
        addedAt: record.watchedAt ?? new Date(0),
        providerIds: {},
        mediaSources: [],
        library: { id: '', title: '' },
      }),
      historyKey: record.itemId,
      key: record.itemId,
      ratingKey: record.itemId,
      thumb: '',
      originallyAvailableAt: '',
      viewedAt: this.toUnixTimestamp(record.watchedAt),
      accountID: Number(record.userId) || 0,
      deviceID: 0,
    };
  }

  private toLegacyStatus(status: MediaServerStatus): {
    machineIdentifier: string;
    version: string;
  } {
    return {
      machineIdentifier: status.machineId,
      version: status.version,
    };
  }

  private okResponse(message: string): BasicResponseDto {
    return {
      status: 'OK',
      code: 1,
      message,
    };
  }

  private toLegacyHubSettings(body: CollectionHubSettingsDto): PlexHub {
    return {
      identifier: body.collectionId.toString(),
      title: '',
      recommendationsVisibility: body.recommended ? 'promoted' : 'none',
      homeVisibility: body.ownHome || body.sharedHome ? 'promoted' : 'none',
      promotedToRecommended: body.recommended,
      promotedToOwnHome: body.ownHome,
      promotedToSharedHome: body.sharedHome,
      deletable: true,
    };
  }

  /** @deprecated Use GET /api/media-server instead */
  @Get()
  async getStatus() {
    const status = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getStatus(),
    );
    if (status == null) {
      throw new InternalServerErrorException('Could not fetch Plex status');
    }
    return this.toLegacyStatus(status);
  }

  /** @deprecated Use GET /api/media-server/libraries instead */
  @Get('libraries')
  async getLibraries() {
    const libraries = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getLibraries(),
    );
    if (libraries == null) {
      throw new InternalServerErrorException('Could not fetch Plex libraries');
    }
    return libraries.map((library) => this.toLegacyLibrary(library));
  }

  /** @deprecated Use GET /api/media-server/library/:id/content?page=X&limit=Y instead */
  @Get('library/:id/content/:page')
  async getLibraryContent(
    @Param('id') id: string,
    @Param('page', ParseIntPipe) page: number,
    @Query('amount', new ParseIntPipe({ optional: true })) amount?: number,
  ) {
    const size = amount ?? 50;
    const offset = (page - 1) * size;
    const result = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getLibraryContents(id, {
        offset,
        limit: size,
      }),
    );
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex library contents',
      );
    }
    return {
      totalSize: result.totalSize,
      items: result.items.map((item) => this.toLegacyLibraryItem(item)),
    };
  }

  /** @deprecated Use GET /api/media-server/library/:id/content/search/:query instead */
  @Get('library/:id/content/search/:query')
  async searchLibraryContent(
    @Param('id') id: string,
    @Param('query') query: string,
    @Query('type') type?: string,
  ) {
    const result = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.searchLibraryContents(id, query, type as any),
    );
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not search Plex library contents',
      );
    }
    return result.map((item) => this.toLegacyLibraryItem(item));
  }

  /** @deprecated Use GET /api/media-server/meta/:id instead */
  @Get('meta/:id')
  async getMetadata(@Param('id') id: string) {
    const result = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getMetadata(id),
    );
    if (result == null) {
      throw new InternalServerErrorException('Could not fetch Plex metadata');
    }
    return this.toLegacyMetadata(result);
  }

  /** @deprecated Use GET /api/media-server/meta/:id/seen instead */
  @Get('meta/:id/seen')
  async getSeenBy(@Param('id') id: string) {
    const result = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getWatchHistory(id),
    );
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex watch history',
      );
    }
    return result.map((record) => this.toLegacySeenBy(record));
  }

  /** @deprecated Use GET /api/media-server/users instead */
  @Get('users')
  async getUsers() {
    const result = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getUsers(),
    );
    if (result == null) {
      throw new InternalServerErrorException('Could not fetch Plex users');
    }
    return result.map((user) => this.toLegacyUser(user));
  }

  /** @deprecated Use GET /api/media-server/meta/:id/children instead */
  @Get('meta/:id/children')
  async getChildrenMetadata(@Param('id') id: string) {
    const result = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getChildrenMetadata(id),
    );
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex children metadata',
      );
    }
    return result.map((item) => this.toLegacyMetadata(item));
  }

  /** @deprecated Use GET /api/media-server/library/:id/recent instead */
  @Get('library/:id/recent')
  async getRecentlyAdded(@Param('id') id: string) {
    const result = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getRecentlyAdded(id),
    );
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch recently added items',
      );
    }
    return result.map((item) => this.toLegacyLibraryItem(item));
  }

  /** @deprecated Use GET /api/media-server/library/:id/collections instead */
  @Get('library/:id/collections')
  async getCollections(@Param('id') id: string) {
    const collections = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getCollections(id),
    );
    if (collections == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex collections',
      );
    }
    return collections.map((collection) => this.toLegacyCollection(collection));
  }

  /** @deprecated Use GET /api/media-server/collection/:id instead */
  @Get('library/collection/:collectionId')
  async getCollection(@Param('collectionId') collectionId: string) {
    const collection = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getCollection(collectionId),
    );
    if (collection == null) {
      throw new InternalServerErrorException('Could not fetch Plex collection');
    }
    return this.toLegacyCollection(collection);
  }

  /** @deprecated Use GET /api/media-server/collection/:id/children instead */
  @Get('library/collection/:collectionId/children')
  async getCollectionChildren(@Param('collectionId') collectionId: string) {
    const children = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.getCollectionChildren(collectionId),
    );
    if (children == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex collection children',
      );
    }
    return children.map((item) => this.toLegacyLibraryItem(item));
  }

  /** @deprecated Use GET /api/media-server/search/:query instead */
  @Get('search/:input')
  async searchLibrary(@Param('input') input: string) {
    const result = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.searchContent(input),
    );
    if (result == null) {
      throw new InternalServerErrorException('Could not search Plex library');
    }
    return result.map((item) => this.toLegacyMetadata(item));
  }

  /** @deprecated Use PUT /api/media-server/collection/:collectionId/item/:itemId instead */
  @Put('library/collection/:collectionId/child/:childId')
  async addChildToCollection(
    @Param('collectionId') collectionId: string,
    @Param('childId') childId: string,
  ) {
    const mediaServer = await this.mediaServerFactory.getService();
    await mediaServer.addToCollection(collectionId, childId);
    return this.okResponse('Item added to collection');
  }

  /** @deprecated Use DELETE /api/media-server/collection/:collectionId/item/:itemId instead */
  @Delete('library/collection/:collectionId/child/:childId')
  async deleteChildFromCollection(
    @Param('collectionId') collectionId: string,
    @Param('childId') childId: string,
  ) {
    const mediaServer = await this.mediaServerFactory.getService();
    await mediaServer.removeFromCollection(collectionId, childId);
    return this.okResponse('Item removed from collection');
  }

  /** @deprecated Use PUT /api/media-server/collection instead */
  @Put('library/collection/update')
  async updateCollection(@Body() body: CreateUpdateCollection) {
    const collection = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.updateCollection({
        libraryId: body.libraryId?.toString() ?? '',
        collectionId: body.collectionId?.toString() ?? '',
        title: body.title,
        summary: body.summary,
        sortTitle: body.sortTitle,
      }),
    );
    if (collection == null) {
      throw new InternalServerErrorException(
        'Could not update Plex collection',
      );
    }
    return this.toLegacyCollection(collection);
  }

  /** @deprecated Use POST /api/media-server/collection instead */
  @Post('library/collection/create')
  async createCollection(@Body() body: CreateUpdateCollection) {
    const collection = await this.executeLegacyRequest((mediaServer) =>
      mediaServer.createCollection({
        libraryId: body.libraryId?.toString() ?? '',
        title: body.title ?? '',
        summary: body.summary,
        type: PlexMapper.plexDataTypeToMediaItemType(body.type),
        sortTitle: body.sortTitle,
      }),
    );
    if (collection == null) {
      throw new InternalServerErrorException(
        'Could not create Plex collection',
      );
    }
    return this.toLegacyCollection(collection);
  }

  /** @deprecated Use DELETE /api/media-server/collection/:id instead */
  @Delete('library/collection/:collectionId')
  async deleteCollection(@Param('collectionId') collectionId: string) {
    const mediaServer = await this.mediaServerFactory.getService();
    await mediaServer.deleteCollection(collectionId);
    return this.okResponse('Collection deleted');
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
      return this.toLegacyHubSettings(body);
    } else {
      return 'Incorrect input parameters supplied.';
    }
  }
}
