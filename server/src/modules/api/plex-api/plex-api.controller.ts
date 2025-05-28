import {
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
  getStatus(): any {
    return this.plexApiService.getStatus();
  }

  @Get('libraries')
  async getLibraries() {
    return this.plexApiService.getLibraries();
  }
<<<<<<< HEAD

  @Get('library/:id/content{/:page}')
  getLibraryContent(
=======
  @Get('library/:id/content')
<<<<<<< HEAD
  async getPagedContent(
>>>>>>> fafbad29 (initial commit after updating to new branch and fixing conflicts)
=======
  async getLibraryContent(
>>>>>>> 134942b7 (added exclusions tooltip to posterview)
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('size') size?: string,
    @Query('sort') sort?: string,
  ) {
    const offset = (parseInt(page) - 1) * parseInt(size);

    return this.plexApiService.getLibraryContents(
      id,
      { offset, size: parseInt(size) },
      undefined,
      sort,
    );
  }
<<<<<<< HEAD
=======
  @Get('library/:id/content/count')
  async getLibraryContentCount(
    @Param('id') id: string,
    @Query('type') type?: EPlexDataType,
  ) {
    const [count, libraries] = await Promise.all([
      this.plexApiService.getLibraryContentCount(id, type),
      this.plexApiService.getLibraries(),
    ]);

    const library = libraries.find((lib) => String(lib.key) === String(id));
    const libraryName = library?.title ?? 'Unknown';

    return { count: (count ?? 0) + 20, libraryName };
  }
>>>>>>> a013b3db (changing data fetch to pull only the library count, instead of a hardcoded 1000)

  @Get('library/:id/content/search/:query')
  searchibraryContent(
    @Param('id') id: string,
    @Param('query') query: string,
    @Query('type') type?: EPlexDataType,
  ) {
    return this.plexApiService.searchLibraryContents(id, query, type);
  }

  @Get('meta/:id')
  getMetadata(@Param('id') id: string) {
    return this.plexApiService.getMetadata(id);
  }

  @Get('meta/:id/seen')
  getSeenBy(@Param('id') id: string) {
    return this.plexApiService.getWatchHistory(id);
  }

  @Get('users')
  getUser() {
    return this.plexApiService.getUsers();
  }

  @Get('meta/:id/children')
  getChildrenMetadata(@Param('id') id: string) {
    return this.plexApiService.getChildrenMetadata(id);
  }

  @Get('library/:id/recent')
  getRecentlyAdded(@Param('id', new ParseIntPipe()) id: number) {
    return this.plexApiService.getRecentlyAdded(id.toString());
  }

  @Get('library/:id/collections')
  async getCollections(@Param('id', new ParseIntPipe()) id: number) {
    const collection: PlexCollection[] =
      await this.plexApiService.getCollections(id.toString());
    return collection;
  }

  @Get('library/collection/:collectionId')
  async getCollection(
    @Param('collectionId', new ParseIntPipe()) collectionId: number,
  ) {
    const collection: PlexCollection = await this.plexApiService.getCollection(
      collectionId.toString(),
    );
    return collection;
  }

  @Get('library/collection/:collectionId/children')
  async getCollectionChildren(
    @Param('collectionId', new ParseIntPipe()) collectionId: number,
  ) {
    const collection: PlexLibraryItem[] =
      await this.plexApiService.getCollectionChildren(collectionId.toString());
    return collection;
  }

  @Get('/search/:input')
  async searchLibrary(@Param('input') input: string) {
    return await this.plexApiService.searchContent(input);
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
    return collection;
  }

  @Post('library/collection/create')
  async createCollection(@Body() body: CreateUpdateCollection) {
    const collection: PlexCollection =
      await this.plexApiService.createCollection(body);
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
      return response;
    } else {
      return 'Incorrect input parameters supplied.';
    }
  }
}
