import {
  CollectionMediaSortField,
  ECollectionLogType,
  MediaItemType,
  MediaLibrarySortField,
  collectionMediaSortFields,
  mediaLibrarySortFields,
  mediaSortOrders,
  MediaSortOrder,
} from '@maintainerr/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { MaintainerrLogger } from '../logging/logs.service';
import { CollectionWorkerService } from './collection-worker.service';
import { CollectionsService } from './collections.service';
import {
  AddRemoveCollectionMedia,
  IAlterableMediaDto,
} from './interfaces/collection-media.interface';

const collectionMediaSortQuerySchema = z
  .enum(collectionMediaSortFields)
  .optional();
const mediaLibrarySortQuerySchema = z.enum(mediaLibrarySortFields).optional();
const mediaSortOrderQuerySchema = z.enum(mediaSortOrders).optional();

@Controller('api/collections')
export class CollectionsController {
  constructor(
    private readonly collectionService: CollectionsService,
    private readonly collectionWorkerService: CollectionWorkerService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(CollectionsController.name);
  }
  @Post()
  async createCollection(@Body() request: any) {
    await this.collectionService.createCollectionWithChildren(
      request.collection,
      request.media,
    );
  }
  @Post('/add')
  async addToCollection(
    @Body()
    request: {
      collectionId: number;
      media: AddRemoveCollectionMedia[];
      manual?: boolean;
    },
  ) {
    await this.collectionService.addToCollection(
      request.collectionId,
      request.media,
      request.manual ? request.manual : false,
    );
  }
  @Post('/remove')
  async removeFromCollection(@Body() request: any) {
    await this.collectionService.removeFromCollection(
      request.collectionId,
      request.media,
    );
  }
  @Post('/removeCollection')
  removeCollection(@Body() request: any) {
    return this.collectionService.deleteCollection(request.collectionId);
  }

  @Put()
  updateCollection(@Body() request: any) {
    return this.collectionService.updateCollection(request);
  }

  @Post('/handle')
  async handleCollection() {
    if (this.collectionWorkerService.isRunning()) {
      throw new HttpException(
        'The collection handler is already running',
        HttpStatus.CONFLICT,
      );
    }

    this.collectionWorkerService
      .execute()
      .catch((error) =>
        this.logger.error(
          'Failed to start collection handler execution',
          error,
        ),
      );
  }

  @Put('/schedule/update')
  updateSchedule(@Body() request: { schedule: string }) {
    return this.collectionWorkerService.updateJob(request.schedule);
  }

  @Get('/deactivate/:id')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.collectionService.deactivateCollection(id);
  }

  @Get('/activate/:id')
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.collectionService.activateCollection(id);
  }

  @Get()
  getCollections(
    @Query('libraryId') libraryId: string,
    @Query('typeId') typeId: MediaItemType,
  ) {
    if (libraryId) {
      return this.collectionService.getCollections(libraryId, undefined);
    } else if (typeId) {
      return this.collectionService.getCollections(undefined, typeId);
    } else {
      return this.collectionService.getCollections(undefined, undefined);
    }
  }
  @Get('/collection/:id')
  getCollection(@Param('id', ParseIntPipe) collectionId: number) {
    return this.collectionService.getCollection(collectionId);
  }

  @Post('/media/add')
  ManualActionOnCollection(
    @Body()
    request: {
      mediaId: string;
      context: IAlterableMediaDto;
      collectionId: number;
      action: 0 | 1;
    },
  ) {
    return this.collectionService.MediaCollectionActionWithContext(
      request.collectionId,
      request.context,
      { mediaServerId: request.mediaId },
      request.action === 0 ? 'add' : 'remove',
    );
  }
  @Delete('/media')
  deleteMediaFromCollection(
    @Query('mediaId') mediaId: string,
    @Query('collectionId', new ParseIntPipe({ optional: true }))
    collectionId?: number,
  ) {
    if (!collectionId) {
      return this.collectionService.removeFromAllCollections([
        { mediaServerId: mediaId },
      ]);
    }
    return this.collectionService.removeFromCollection(collectionId, [
      { mediaServerId: mediaId },
    ]);
  }

  @Get('/media/')
  getMediaInCollection(
    @Query('collectionId', ParseIntPipe) collectionId: number,
  ) {
    return this.collectionService.getCollectionMedia(collectionId);
  }

  @Get('/media/count')
  getMediaInCollectionCount(
    @Query('collectionId', new ParseIntPipe({ optional: true }))
    collectionId?: number,
  ) {
    return this.collectionService.getCollectionMediaCount(collectionId);
  }

  @Get('/media/:id/content/:page')
  getLibraryContent(
    @Param('id', ParseIntPipe) id: number,
    @Param('page', ParseIntPipe) page: number,
    @Query('sort', new ZodValidationPipe(collectionMediaSortQuerySchema))
    sort?: CollectionMediaSortField,
    @Query('sortOrder', new ZodValidationPipe(mediaSortOrderQuerySchema))
    sortOrder?: MediaSortOrder,
    @Query('size', new ParseIntPipe({ optional: true })) amount?: number,
  ) {
    const size = amount ?? 25;
    const offset = (page - 1) * size;
    return this.collectionService.getCollectionMediaWithServerDataAndPaging(
      id,
      {
        offset: offset,
        size: size,
        sort,
        sortOrder,
      },
    );
  }

  @Get('/exclusions/:id/content/:page')
  getExclusions(
    @Param('id', ParseIntPipe) id: number,
    @Param('page', ParseIntPipe) page: number,
    @Query('sort', new ZodValidationPipe(mediaLibrarySortQuerySchema))
    sort?: MediaLibrarySortField,
    @Query('sortOrder', new ZodValidationPipe(mediaSortOrderQuerySchema))
    sortOrder?: MediaSortOrder,
    @Query('size', new ParseIntPipe({ optional: true })) amount?: number,
  ) {
    const size = amount ?? 25;
    const offset = (page - 1) * size;
    return this.collectionService.getCollectionExclusionsWithServerDataAndPaging(
      id,
      {
        offset: offset,
        size: size,
        sort,
        sortOrder,
      },
    );
  }

  @Get('/logs/:id/content/:page')
  getCollectionLogs(
    @Param('id', ParseIntPipe) id: number,
    @Param('page', ParseIntPipe) page: number,
    @Query('search') search: string,
    @Query('sort') sort: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter: ECollectionLogType,
    @Query('size', new ParseIntPipe({ optional: true })) amount?: number,
  ) {
    const size = amount ?? 25;
    const offset = (page - 1) * size;
    return this.collectionService.getCollectionLogsWithPaging(
      id,
      {
        offset: offset,
        size: size,
      },
      search,
      sort,
      filter,
    );
  }
}
