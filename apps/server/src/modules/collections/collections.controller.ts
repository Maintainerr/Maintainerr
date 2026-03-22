import { ECollectionLogType, MediaItemType } from '@maintainerr/contracts';
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
import {
  addToCollectionRequestSchema,
  createCollectionRequestSchema,
  removeCollectionRequestSchema,
  removeFromCollectionRequestSchema,
  updateCollectionRequestSchema,
} from './collections.schemas';
import { CollectionsService } from './collections.service';
import {
  AddRemoveCollectionMedia,
  IAlterableMediaDto,
} from './interfaces/collection-media.interface';
import { ICollection } from './interfaces/collection.interface';

type CreateCollectionRequest = z.infer<typeof createCollectionRequestSchema>;
type AddToCollectionRequest = z.infer<typeof addToCollectionRequestSchema>;
type RemoveFromCollectionRequest = z.infer<
  typeof removeFromCollectionRequestSchema
>;
type RemoveCollectionRequest = z.infer<typeof removeCollectionRequestSchema>;
type UpdateCollectionRequest = z.infer<typeof updateCollectionRequestSchema>;

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
  async createCollection(
    @Body(new ZodValidationPipe(createCollectionRequestSchema))
    request: CreateCollectionRequest,
  ) {
    await this.collectionService.createCollectionWithChildren(
      request.collection as ICollection,
      request.media as AddRemoveCollectionMedia[] | undefined,
    );
  }
  @Post('/add')
  async addToCollection(
    @Body(new ZodValidationPipe(addToCollectionRequestSchema))
    request: AddToCollectionRequest,
  ) {
    await this.collectionService.addToCollection(
      request.collectionId,
      request.media as AddRemoveCollectionMedia[],
      request.manual ? request.manual : false,
    );
  }
  @Post('/remove')
  async removeFromCollection(
    @Body(new ZodValidationPipe(removeFromCollectionRequestSchema))
    request: RemoveFromCollectionRequest,
  ) {
    await this.collectionService.removeFromCollection(
      request.collectionId,
      request.media as AddRemoveCollectionMedia[],
    );
  }
  @Post('/removeCollection')
  removeCollection(
    @Body(new ZodValidationPipe(removeCollectionRequestSchema))
    request: RemoveCollectionRequest,
  ) {
    return this.collectionService.deleteCollection(request.collectionId);
  }

  @Put()
  updateCollection(
    @Body(new ZodValidationPipe(updateCollectionRequestSchema))
    request: UpdateCollectionRequest,
  ) {
    return this.collectionService.updateCollection(request as ICollection);
  }

  @Post('/handle')
  async handleCollection() {
    if (this.collectionWorkerService.isRunning()) {
      throw new HttpException(
        'The collection handler is already running',
        HttpStatus.CONFLICT,
      );
    }

    this.collectionWorkerService.execute().catch((e) =>
      this.logger.error(
        {
          message: 'Failed to start collection handler execution',
          error: e,
        },
        e instanceof Error ? e.stack : undefined,
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
    @Query('size', new ParseIntPipe({ optional: true })) amount?: number,
  ) {
    const size = amount ?? 25;
    const offset = (page - 1) * size;
    return this.collectionService.getCollectionMediaWithServerDataAndPaging(
      id,
      {
        offset: offset,
        size: size,
      },
    );
  }

  @Get('/exclusions/:id/content/:page')
  getExclusions(
    @Param('id', ParseIntPipe) id: number,
    @Param('page', ParseIntPipe) page: number,
    @Query('size', new ParseIntPipe({ optional: true })) amount?: number,
  ) {
    const size = amount ?? 25;
    const offset = (page - 1) * size;
    return this.collectionService.getCollectionExclusionsWithServerDataAndPaging(
      id,
      {
        offset: offset,
        size: size,
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
