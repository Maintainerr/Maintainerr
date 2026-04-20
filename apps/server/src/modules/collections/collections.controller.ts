import {
  CollectionMediaSortField,
  ECollectionLogType,
  MediaItemType,
  MediaItemTypes,
  MediaLibrarySortField,
  MediaSortOrder,
  collectionMediaSortFields,
  mediaLibrarySortFields,
  mediaSortOrders,
} from '@maintainerr/contracts';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { MaintainerrLogger } from '../logging/logs.service';
import { RuleExecutorJobManagerService } from '../rules/tasks/rule-executor-job-manager.service';
import { ExecutionLockService } from '../tasks/execution-lock.service';
import { CollectionHandler } from './collection-handler';
import { CollectionWorkerService } from './collection-worker.service';
import { CollectionsService } from './collections.service';
import {
  AlterableMediaContext,
  CollectionMediaChange,
} from './interfaces/collection-media.interface';

const collectionMediaSortQuerySchema = z
  .enum(collectionMediaSortFields)
  .optional();
const mediaLibrarySortQuerySchema = z.enum(mediaLibrarySortFields).optional();
const mediaSortOrderQuerySchema = z.enum(mediaSortOrders).optional();
const handleCollectionMediaBodySchema = z.object({
  collectionId: z.number().int(),
  mediaId: z.string().min(1),
});

type HandleCollectionMediaBody = z.infer<
  typeof handleCollectionMediaBodySchema
>;

@Controller('api/collections')
export class CollectionsController {
  constructor(
    private readonly collectionService: CollectionsService,
    private readonly collectionWorkerService: CollectionWorkerService,
    private readonly ruleExecutorJobManagerService: RuleExecutorJobManagerService,
    private readonly executionLock: ExecutionLockService,
    private readonly collectionHandler: CollectionHandler,
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
      media: CollectionMediaChange[];
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
    return this.collectionService.getCollections(
      libraryId || undefined,
      typeId || undefined,
    );
  }

  @Get('/overlay-data')
  @ApiOperation({
    summary: 'Get collections with full media membership for overlay consumers',
  })
  @ApiQuery({
    name: 'libraryId',
    required: false,
    description: 'Filter collections by library id.',
  })
  @ApiQuery({
    name: 'typeId',
    required: false,
    enum: MediaItemTypes,
    description: 'Filter collections by media item type.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns collections with full media arrays for overlay and helper integrations.',
  })
  getCollectionsForOverlayData(
    @Query('libraryId') libraryId: string,
    @Query('typeId') typeId: MediaItemType,
  ) {
    return this.collectionService.getCollectionsForOverlayData(
      libraryId || undefined,
      typeId || undefined,
    );
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
      context: AlterableMediaContext;
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

  @Post('/media/handle')
  async handleCollectionMedia(
    @Body(new ZodValidationPipe(handleCollectionMediaBodySchema))
    request: HandleCollectionMediaBody,
  ) {
    if (
      this.collectionWorkerService.isRunning() ||
      this.ruleExecutorJobManagerService.isProcessing()
    ) {
      throw new ConflictException(
        'Collection handling is already running. Try again when the current collection or rule execution finishes.',
      );
    }

    const collection = await this.collectionService.getCollectionRecord(
      request.collectionId,
    );

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    const collectionMedia =
      await this.collectionService.getCollectionMediaRecord(
        request.collectionId,
        request.mediaId,
      );

    if (!collectionMedia) {
      throw new NotFoundException('Media not found in collection');
    }

    const release = this.executionLock.tryAcquire('rules-collections-lock');

    if (!release) {
      throw new ConflictException(
        'Collection handling is already running. Try again when the current collection or rule execution finishes.',
      );
    }

    try {
      const handled = await this.collectionHandler.handleMedia(
        collection,
        collectionMedia,
      );

      if (!handled) {
        throw new ConflictException(
          'The collection action could not be executed for this item',
        );
      }
    } finally {
      release();
    }
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
