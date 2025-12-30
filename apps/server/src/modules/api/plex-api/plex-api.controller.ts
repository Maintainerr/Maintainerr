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
} from '@nestjs/common';
import { BasicResponseDto } from './dto/basic-response.dto';
import { CollectionHubSettingsDto } from './dto/collection-hub-settings.dto';
import { EPlexDataType } from './enums/plex-data-type-enum';
import { PlexSetupGuard } from './guards/plex-setup.guard';
import {
  CreateUpdateCollection,
  PlexCollection,
} from './interfaces/collection.interface';
import { PlexHub, PlexLibraryItem } from './interfaces/library.interfaces';
import { PlexApiService } from './plex-api.service';

@UseGuards(PlexSetupGuard)
@Controller('api/plex')
export class PlexApiController {
  constructor(private readonly plexApiService: PlexApiService) {}
  @Get()
  async getStatus(): Promise<any> {
    const status = await this.plexApiService.getStatus();
    if (status == null) {
      throw new InternalServerErrorException('Could not fetch Plex status');
    }
    return status;
  }

  @Get('libraries')
  async getLibraries() {
    const libraries = await this.plexApiService.getLibraries();
    if (libraries == null) {
      throw new InternalServerErrorException('Could not fetch Plex libraries');
    }
    return libraries;
  }

  @Get('library/:id/content{/:page}')
  async getLibraryContent(
    @Param('id') id: string,
    @Param('page', new ParseIntPipe()) page: number,
    @Query('amount') amount: number,
  ) {
    const size = amount ? amount : 50;
    const offset = (page - 1) * size;
    const result = await this.plexApiService.getLibraryContents(id, {
      offset: offset,
      size: size,
    });
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex library contents',
      );
    }
    return result;
  }

  @Get('library/:id/content/search/:query')
  async searchLibraryContent(
    @Param('id') id: string,
    @Param('query') query: string,
    @Query('type') type?: EPlexDataType,
  ) {
    const result = await this.plexApiService.searchLibraryContents(
      id,
      query,
      type,
    );
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not search Plex library contents',
      );
    }
    return result;
  }

  @Get('meta/:id')
  async getMetadata(@Param('id') id: string) {
    const result = await this.plexApiService.getMetadata(id);
    if (result == null) {
      throw new InternalServerErrorException('Could not fetch Plex metadata');
    }
    return result;
  }

  @Get('meta/:id/seen')
  async getSeenBy(@Param('id') id: string) {
    const result = await this.plexApiService.getWatchHistory(id);
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex watch history',
      );
    }
    return result;
  }

  @Get('users')
  async getUser() {
    const result = await this.plexApiService.getUsers();
    if (result == null) {
      throw new InternalServerErrorException('Could not fetch Plex users');
    }
    return result;
  }

  @Get('meta/:id/children')
  async getChildrenMetadata(@Param('id') id: string) {
    const result = await this.plexApiService.getChildrenMetadata(id);
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex children metadata',
      );
    }
    return result;
  }

  @Get('library/:id/recent')
  async getRecentlyAdded(@Param('id', new ParseIntPipe()) id: number) {
    const result = await this.plexApiService.getRecentlyAdded(id.toString());
    if (result == null) {
      throw new InternalServerErrorException(
        'Could not fetch recently added items',
      );
    }
    return result;
  }

  @Get('library/:id/collections')
  async getCollections(@Param('id', new ParseIntPipe()) id: number) {
    const collection: PlexCollection[] =
      await this.plexApiService.getCollections(id.toString());
    if (collection == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex collections',
      );
    }
    return collection;
  }

  @Get('library/collection/:collectionId')
  async getCollection(
    @Param('collectionId', new ParseIntPipe()) collectionId: number,
  ) {
    const collection: PlexCollection = await this.plexApiService.getCollection(
      collectionId.toString(),
    );
    if (collection == null) {
      throw new InternalServerErrorException('Could not fetch Plex collection');
    }
    return collection;
  }

  @Get('library/collection/:collectionId/children')
  async getCollectionChildren(
    @Param('collectionId', new ParseIntPipe()) collectionId: number,
  ) {
    const collection: PlexLibraryItem[] =
      await this.plexApiService.getCollectionChildren(collectionId.toString());
    if (collection == null) {
      throw new InternalServerErrorException(
        'Could not fetch Plex collection children',
      );
    }
    return collection;
  }

  @Get('/search/:input')
  async searchLibrary(@Param('input') input: string) {
    const result = await this.plexApiService.searchContent(input);
    if (result == null) {
      throw new InternalServerErrorException('Could not search Plex library');
    }
    return result;
  }

  @Put('library/collection/:collectionId/child/:childId')
  async addChildToCollection(
    @Param('collectionId', new ParseIntPipe()) collectionId: number,
    @Param('childId', new ParseIntPipe()) childId: number,
  ) {
    const collection: PlexCollection | BasicResponseDto =
      await this.plexApiService.addChildToCollection(
        collectionId.toString(),
        childId.toString(),
      );
    return collection;
  }

  @Delete('library/collection/:collectionId/child/:childId')
  async deleteChildFromCollection(
    @Param('collectionId', new ParseIntPipe()) collectionId: number,
    @Param('childId', new ParseIntPipe()) childId: number,
  ) {
    const collection: BasicResponseDto =
      await this.plexApiService.deleteChildFromCollection(
        collectionId.toString(),
        childId.toString(),
      );
    return collection;
  }

  @Put('library/collection/update')
  async updateCollection(@Body() body: CreateUpdateCollection) {
    const collection: PlexCollection =
      await this.plexApiService.updateCollection(body);
    if (collection == null) {
      throw new InternalServerErrorException(
        'Could not update Plex collection',
      );
    }
    return collection;
  }

  @Post('library/collection/create')
  async createCollection(@Body() body: CreateUpdateCollection) {
    const collection: PlexCollection =
      await this.plexApiService.createCollection(body);
    if (collection == null) {
      throw new InternalServerErrorException(
        'Could not create Plex collection',
      );
    }
    return collection;
  }

  @Delete('library/collection/:collectionId')
  async deleteCollection(
    @Param('collectionId', new ParseIntPipe()) collectionId: number,
  ) {
    const collection: BasicResponseDto =
      await this.plexApiService.deleteCollection(collectionId.toString());
    return collection;
  }

  @Put('library/collection/settings')
  async UpdateCollectionSettings(@Body() body: CollectionHubSettingsDto) {
    if (
      body.libraryId &&
      body.collectionId &&
      body.recommended !== undefined &&
      body.sharedHome !== undefined &&
      body.ownHome !== undefined
    ) {
      const response: PlexHub =
        await this.plexApiService.UpdateCollectionSettings(body);
      if (response == null) {
        throw new InternalServerErrorException(
          'Could not update Plex collection settings',
        );
      }
      return response;
    } else {
      return 'Incorrect input parameters supplied.';
    }
  }
}
