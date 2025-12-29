# Phase D: Collection Service & Handler Integration

**Duration:** ~1 week  
**Goal:** Update CollectionsService and CollectionHandler to use abstraction layer

**Prerequisite:** Phase A, B, C complete

---

## D.1: Understanding Current Architecture

### Key Files

```
apps/server/src/modules/collections/
├── collections.service.ts      # Main service (1261 lines)
├── collection-handler.ts       # Plex sync handler
├── entities/
│   ├── collection.entities.ts          # Collection entity
│   └── collection_media.entities.ts    # Junction table
└── dto/
    └── collection.dto.ts       # DTOs
```

### Current PlexApiService Usage in CollectionsService

Based on analysis:
1. `createCollection()` - Creates Plex collection + visibility settings
2. `deleteCollection()` - Removes from Plex
3. `addToCollection()` - Adds media to Plex collection
4. `removeFromCollection()` - Removes media from Plex collection
5. `UpdateCollectionSettings()` - Sets visibility (Plex-only!)
6. `getCollectionChildren()` - Lists collection contents

---

## D.2: Entity Updates

### Update `collection.entities.ts`

Rename `plexId` → `mediaServerId` and add `mediaServerType`:

```typescript
@Entity()
export class Collection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  libraryId: number;

  @Column({ default: true })
  isActive: boolean;

  // RENAMED from plexId
  @Column({ nullable: true })
  mediaServerId: string;

  // NEW: Track which server type
  @Column({ type: 'varchar', default: 'plex' })
  mediaServerType: 'plex' | 'jellyfin';

  // Plex-specific settings (will be null for Jellyfin)
  @Column({ default: false })
  visibleOnHome: boolean;

  @Column({ default: false })
  visibleOnRecommended: boolean;

  // ... other fields
}
```

### Database Migration

Create migration: `{timestamp}-rename-plexid-to-mediaserverid.ts`

```typescript
export class RenameField1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename column
    await queryRunner.renameColumn('collection', 'plexId', 'mediaServerId');
    
    // Add new column
    await queryRunner.addColumn('collection', new TableColumn({
      name: 'mediaServerType',
      type: 'varchar',
      default: "'plex'",
    }));
    
    // Same for collection_media if needed
    await queryRunner.renameColumn('collection_media', 'plexId', 'mediaServerId');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameColumn('collection', 'mediaServerId', 'plexId');
    await queryRunner.dropColumn('collection', 'mediaServerType');
    await queryRunner.renameColumn('collection_media', 'mediaServerId', 'plexId');
  }
}
```

---

## D.3: Update CollectionsService

### Key Changes

1. Inject `MediaServerFactory` instead of `PlexApiService`
2. Handle visibility settings conditionally
3. Use `MediaItem` types instead of `PlexLibraryItem`

### Updated Method: `createCollection()`

```typescript
@Injectable()
export class CollectionsService {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    // ... other deps
  ) {}

  async createCollection(params: CreateCollectionDto): Promise<Collection> {
    const mediaServer = await this.mediaServerFactory.getService();
    const settings = await this.settingsService.getSettings();

    // Create in media server
    const serverCollection = await mediaServer.createCollection({
      name: params.name,
      libraryId: params.libraryId.toString(),
    });

    // Handle visibility (Plex-only feature)
    if (mediaServer.supportsFeature(EMediaServerFeature.COLLECTION_VISIBILITY)) {
      await mediaServer.updateCollectionVisibility?.(serverCollection.id, {
        visibleOnHome: params.visibleOnHome ?? false,
        visibleOnRecommended: params.visibleOnRecommended ?? false,
      });
    } else if (params.visibleOnHome || params.visibleOnRecommended) {
      this.logger.warn(
        `Collection visibility settings ignored - not supported by ${mediaServer.getServerType()}`
      );
    }

    // Save to database
    const collection = this.collectionRepository.create({
      ...params,
      mediaServerId: serverCollection.id,
      mediaServerType: settings.media_server_type,
    });

    return this.collectionRepository.save(collection);
  }

  async deleteCollection(id: number): Promise<void> {
    const collection = await this.collectionRepository.findOne({ where: { id } });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    const mediaServer = await this.mediaServerFactory.getService();

    // Delete from media server
    if (collection.mediaServerId) {
      try {
        await mediaServer.deleteCollection(collection.mediaServerId);
      } catch (error) {
        this.logger.warn(`Failed to delete collection from media server: ${error.message}`);
      }
    }

    // Delete from database
    await this.collectionRepository.remove(collection);
  }

  async addToCollection(collectionId: number, mediaServerId: string): Promise<void> {
    const collection = await this.collectionRepository.findOne({ where: { id: collectionId } });
    if (!collection?.mediaServerId) {
      throw new NotFoundException('Collection not found or not linked to media server');
    }

    const mediaServer = await this.mediaServerFactory.getService();
    await mediaServer.addToCollection(collection.mediaServerId, mediaServerId);

    // Update collection_media junction
    await this.collectionMediaRepository.save({
      collectionId,
      mediaServerId,
    });
  }

  async removeFromCollection(collectionId: number, mediaServerId: string): Promise<void> {
    const collection = await this.collectionRepository.findOne({ where: { id: collectionId } });
    if (!collection?.mediaServerId) {
      throw new NotFoundException('Collection not found');
    }

    const mediaServer = await this.mediaServerFactory.getService();
    await mediaServer.removeFromCollection(collection.mediaServerId, mediaServerId);

    // Remove from junction table
    await this.collectionMediaRepository.delete({
      collectionId,
      mediaServerId,
    });
  }

  async syncCollectionWithMediaServer(collectionId: number): Promise<void> {
    const collection = await this.collectionRepository.findOne({
      where: { id: collectionId },
      relations: ['media'],
    });
    
    if (!collection?.mediaServerId) return;

    const mediaServer = await this.mediaServerFactory.getService();
    
    // Get current children from media server
    const serverChildren = await mediaServer.getCollectionChildren(collection.mediaServerId);
    const serverIds = new Set(serverChildren.map(c => c.id));
    
    // Get our tracked items
    const ourIds = new Set(collection.media.map(m => m.mediaServerId));
    
    // Add missing items to server
    for (const media of collection.media) {
      if (!serverIds.has(media.mediaServerId)) {
        await mediaServer.addToCollection(collection.mediaServerId, media.mediaServerId);
      }
    }
    
    // Optionally: remove items from server that we don't track
    // (Depends on desired behavior)
  }
}
```

---

## D.4: Update CollectionHandler

### Key Changes

1. Use `MediaServerFactory`
2. Work with `MediaItem` instead of `PlexLibraryItem`

```typescript
@Injectable()
export class CollectionHandler {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly collectionsService: CollectionsService,
    // ... other deps
  ) {}

  async handleCollectionSync(collection: Collection): Promise<void> {
    const mediaServer = await this.mediaServerFactory.getService();
    
    // Verify collection exists in media server
    if (collection.mediaServerId) {
      const serverCollection = await mediaServer.getCollection(collection.mediaServerId);
      
      if (!serverCollection) {
        this.logger.warn(`Collection ${collection.id} not found in media server, recreating...`);
        await this.recreateCollection(collection);
      }
    }
  }

  private async recreateCollection(collection: Collection): Promise<void> {
    const mediaServer = await this.mediaServerFactory.getService();
    
    const newCollection = await mediaServer.createCollection({
      name: collection.title,
      libraryId: collection.libraryId.toString(),
    });

    // Update visibility if supported
    if (mediaServer.supportsFeature(EMediaServerFeature.COLLECTION_VISIBILITY)) {
      await mediaServer.updateCollectionVisibility?.(newCollection.id, {
        visibleOnHome: collection.visibleOnHome,
        visibleOnRecommended: collection.visibleOnRecommended,
      });
    }

    // Update our record
    collection.mediaServerId = newCollection.id;
    await this.collectionsService.save(collection);

    // Re-add all media items
    const media = await this.collectionMediaRepository.find({
      where: { collectionId: collection.id },
    });

    for (const item of media) {
      await mediaServer.addToCollection(newCollection.id, item.mediaServerId);
    }
  }
}
```

---

## D.5: Update DTOs

### `collection.dto.ts`

```typescript
export class CreateCollectionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  libraryId: number;

  @IsBoolean()
  @IsOptional()
  visibleOnHome?: boolean;  // Plex-only, ignored for Jellyfin

  @IsBoolean()
  @IsOptional()
  visibleOnRecommended?: boolean;  // Plex-only, ignored for Jellyfin
}

export class CollectionResponseDto {
  id: number;
  title: string;
  description?: string;
  libraryId: number;
  mediaServerId?: string;
  mediaServerType: 'plex' | 'jellyfin';
  visibleOnHome: boolean;
  visibleOnRecommended: boolean;
  mediaCount: number;
}
```

---

## D.6: Testing Requirements

### Unit Tests

1. **CollectionsService tests**
   - Test create with visibility for Plex
   - Test create without visibility for Jellyfin
   - Test sync operations
   - Test error handling

2. **CollectionHandler tests**
   - Test sync flow
   - Test recreation flow

3. **Integration tests**
   - Full collection lifecycle

### Test Cases

```typescript
describe('CollectionsService', () => {
  describe('createCollection', () => {
    it('should set visibility for Plex', async () => {
      mockMediaServerFactory.getService.mockResolvedValue(mockPlexAdapter);
      mockPlexAdapter.supportsFeature.mockReturnValue(true);
      
      await service.createCollection({
        title: 'Test',
        libraryId: 1,
        visibleOnHome: true,
      });
      
      expect(mockPlexAdapter.updateCollectionVisibility).toHaveBeenCalled();
    });

    it('should skip visibility for Jellyfin', async () => {
      mockMediaServerFactory.getService.mockResolvedValue(mockJellyfinService);
      mockJellyfinService.supportsFeature.mockReturnValue(false);
      
      await service.createCollection({
        title: 'Test',
        libraryId: 1,
        visibleOnHome: true,
      });
      
      expect(mockJellyfinService.updateCollectionVisibility).not.toHaveBeenCalled();
    });
  });
});
```

---

## D.8: Acceptance Criteria

- [ ] `plexId` renamed to `mediaServerId` throughout
- [ ] `mediaServerType` column added and populated
- [ ] Collection visibility handled conditionally
- [ ] CollectionsService uses MediaServerFactory
- [ ] CollectionHandler works with abstraction
- [ ] DTOs include feature flags
- [ ] Existing Plex collections still work
- [ ] All unit tests pass
- [ ] Database migration runs cleanly

---

## Files Summary

### Modified Files (8)

| File | Changes |
|------|---------|
| `collection.entities.ts` | Rename plexId, add mediaServerType |
| `collection_media.entities.ts` | Rename plexId |
| `collections.service.ts` | Use MediaServerFactory |
| `collection-handler.ts` | Use MediaServerFactory |
| `collection.dto.ts` | Add feature flags |
| Migration file | Rename columns |
| Related test files | Update tests |

### Database Changes

- Rename: `collection.plexId` → `collection.mediaServerId`
- Rename: `collection_media.plexId` → `collection_media.mediaServerId`
- Add: `collection.mediaServerType` (varchar, default 'plex')
