# Phase F: Testing, Documentation & Final Integration

**Duration:** ~1 week  
**Goal:** Comprehensive testing, documentation, and final polish

**Prerequisite:** Phase A-E complete

---

## F.1: Testing Strategy

### Test Categories

1. **Unit Tests** - All new services, mappers, getters
2. **Integration Tests** - Full flows with mocked APIs
3. **E2E Tests** - Critical user journeys
4. **Manual Testing** - Real Jellyfin server testing

---

## F.2: Unit Test Coverage Requirements

### Server Tests

| Component | Target Coverage | Key Tests |
|-----------|-----------------|-----------|
| `JellyfinService` | 90% | All API methods, error handling, caching |
| `JellyfinMapper` | 100% | All conversion functions |
| `JellyfinGetterService` | 90% | All property getters |
| `PlexAdapterService` | 90% | All delegated methods |
| `PlexMapper` | 100% | All conversion functions |
| `MediaServerFactory` | 100% | Service selection logic |
| `MediaServerGetterService` | 100% | Dispatch logic |
| `CollectionsService` (updated) | 85% | New abstraction usage |

### UI Tests

| Component | Target Coverage | Key Tests |
|-----------|-----------------|-----------|
| `MediaServerSelector` | 90% | Selection, state changes |
| `JellyfinSettings` | 85% | Validation, test connection |
| `useMediaServerType` | 100% | All return values |
| `useMediaServerFeatures` | 100% | Feature flags |

---

## F.3: Test Implementation

### Example: JellyfinService Tests

```typescript
// jellyfin.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { JellyfinService } from './jellyfin.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

// Mock the SDK
jest.mock('@jellyfin/sdk', () => ({
  Jellyfin: jest.fn().mockImplementation(() => ({
    createApi: jest.fn().mockReturnValue({
      accessToken: null,
    }),
  })),
}));

jest.mock('@jellyfin/sdk/lib/utils/api', () => ({
  getItemsApi: jest.fn(),
  getLibraryApi: jest.fn(),
  getUserApi: jest.fn(),
  getCollectionApi: jest.fn(),
  getSystemApi: jest.fn(),
}));

describe('JellyfinService', () => {
  let service: JellyfinService;
  let mockCacheManager: any;

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JellyfinService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        // ... other mocks
      ],
    }).compile();

    service = module.get<JellyfinService>(JellyfinService);
  });

  describe('supportsFeature', () => {
    it('should return false for COLLECTION_VISIBILITY', () => {
      expect(service.supportsFeature(EMediaServerFeature.COLLECTION_VISIBILITY))
        .toBe(false);
    });

    it('should return false for WATCHLIST', () => {
      expect(service.supportsFeature(EMediaServerFeature.WATCHLIST))
        .toBe(false);
    });

    it('should return true for PLAYLISTS', () => {
      expect(service.supportsFeature(EMediaServerFeature.PLAYLISTS))
        .toBe(true);
    });
  });

  describe('getWatchHistory', () => {
    it('should return cached data if available', async () => {
      const cachedData = [{ userId: '1', playCount: 5 }];
      mockCacheManager.get.mockResolvedValue(cachedData);

      const result = await service.getWatchHistory('item-1');

      expect(result).toEqual(cachedData);
      expect(mockCacheManager.get).toHaveBeenCalledWith('jellyfin:watch:item-1');
    });

    it('should aggregate watch data across all users', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      // ... mock user and item APIs
      
      const result = await service.getWatchHistory('item-1');
      
      expect(result).toHaveLength(2); // 2 users watched
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  // ... more tests
});
```

### Example: JellyfinMapper Tests

```typescript
// jellyfin.mapper.spec.ts
import { JellyfinMapper } from './jellyfin.mapper';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models';

describe('JellyfinMapper', () => {
  describe('toMediaItem', () => {
    it('should convert BaseItemDto to MediaItem', () => {
      const input = {
        Id: 'abc-123',
        Name: 'Test Movie',
        Type: BaseItemKind.Movie,
        ProductionYear: 2023,
        Overview: 'A test movie',
        DateCreated: '2023-06-15T10:30:00Z',
        RunTimeTicks: 72000000000, // 2 hours in ticks
        ProviderIds: {
          Imdb: 'tt1234567',
          Tmdb: '12345',
        },
        Genres: ['Action', 'Comedy'],
        Tags: ['favorite', 'watched'],
      };

      const result = JellyfinMapper.toMediaItem(input);

      expect(result.id).toBe('abc-123');
      expect(result.title).toBe('Test Movie');
      expect(result.type).toBe(EMediaDataType.MOVIE);
      expect(result.year).toBe(2023);
      expect(result.overview).toBe('A test movie');
      expect(result.durationMs).toBe(7200000); // 2 hours in ms
      expect(result.providerIds.imdb).toBe('tt1234567');
      expect(result.providerIds.tmdb).toBe('12345');
      expect(result.genres).toEqual(['Action', 'Comedy']);
      expect(result.tags).toEqual(['favorite', 'watched']);
    });

    it('should handle missing optional fields', () => {
      const input = {
        Id: 'abc-123',
        Name: 'Minimal Item',
      };

      const result = JellyfinMapper.toMediaItem(input);

      expect(result.id).toBe('abc-123');
      expect(result.title).toBe('Minimal Item');
      expect(result.year).toBeUndefined();
      expect(result.durationMs).toBeUndefined();
    });

    it('should convert duration ticks to milliseconds correctly', () => {
      const input = {
        Id: '1',
        Name: 'Test',
        RunTimeTicks: 36000000000, // 1 hour
      };

      const result = JellyfinMapper.toMediaItem(input);

      expect(result.durationMs).toBe(3600000); // 1 hour in ms
    });
  });

  describe('toMediaDataType', () => {
    it.each([
      [BaseItemKind.Movie, EMediaDataType.MOVIE],
      [BaseItemKind.Series, EMediaDataType.SHOW],
      [BaseItemKind.Season, EMediaDataType.SEASON],
      [BaseItemKind.Episode, EMediaDataType.EPISODE],
      ['Movie', EMediaDataType.MOVIE],
      ['Series', EMediaDataType.SHOW],
    ])('should map %s to %s', (input, expected) => {
      expect(JellyfinMapper.toMediaDataType(input)).toBe(expected);
    });
  });
});
```

---

## F.4: Integration Tests

### Full Rule Evaluation Flow

```typescript
// rules-integration.spec.ts
describe('Rules Engine Integration', () => {
  describe('with Jellyfin', () => {
    beforeEach(async () => {
      // Set up test module with JellyfinService
      await setupTestModule('jellyfin');
    });

    it('should evaluate seenBy rule correctly', async () => {
      // Create collection with seenBy rule
      const collection = await createTestCollection({
        rules: [
          {
            property: RuleProperty.SEEN_BY,
            operator: 'contains',
            value: 'testuser',
          },
        ],
      });

      // Run rule executor
      await ruleExecutor.executeRules(collection);

      // Verify results
      const results = await getCollectionResults(collection.id);
      expect(results).toContainEqual(
        expect.objectContaining({ title: 'Watched Movie' })
      );
    });

    it('should skip watchlist rules with warning', async () => {
      const logSpy = jest.spyOn(logger, 'warn');

      const collection = await createTestCollection({
        rules: [
          {
            property: RuleProperty.WATCHLIST_IS_WATCHLISTED,
            operator: 'equals',
            value: true,
          },
        ],
      });

      await ruleExecutor.executeRules(collection);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('not supported for Jellyfin')
      );
    });
  });
});
```

---

## F.5: E2E Tests

### Critical User Journeys

```typescript
// e2e/jellyfin-setup.spec.ts
describe('Jellyfin Setup Flow', () => {
  it('should complete full Jellyfin setup', async () => {
    // 1. Navigate to settings
    await page.goto('/settings');

    // 2. Select Jellyfin as media server
    await page.click('[data-testid="server-type-jellyfin"]');

    // 3. Fill in Jellyfin settings
    await page.fill('[name="jellyfin_url"]', 'http://jellyfin.test:8096');
    await page.fill('[name="jellyfin_api_key"]', 'test-api-key');

    // 4. Test connection
    await page.click('[data-testid="test-connection"]');
    await expect(page.locator('[data-testid="connection-success"]')).toBeVisible();

    // 5. Save settings
    await page.click('[data-testid="save-settings"]');
    await expect(page.locator('[data-testid="save-success"]')).toBeVisible();

    // 6. Verify libraries loaded
    await page.goto('/');
    await expect(page.locator('[data-testid="library-list"]')).toBeVisible();
  });
});

describe('Collection Creation with Jellyfin', () => {
  beforeAll(async () => {
    // Set up Jellyfin connection
    await setupJellyfinConnection();
  });

  it('should create collection without visibility settings', async () => {
    await page.goto('/collections/new');

    // Fill collection form
    await page.fill('[name="title"]', 'Test Collection');
    await page.selectOption('[name="libraryId"]', { label: 'Movies' });

    // Verify visibility options are not shown
    await expect(page.locator('[name="visibleOnHome"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="visibility-warning"]')).toBeVisible();

    // Create collection
    await page.click('[data-testid="create-collection"]');
    await expect(page).toHaveURL(/\/collections\/\d+/);
  });
});
```

---

## F.6: Manual Testing Checklist

### Jellyfin Server Testing

Use a real Jellyfin test server (or Docker container) to verify:

- [ ] Connection with API key works
- [ ] Libraries are fetched correctly
- [ ] Library content loads with pagination
- [ ] Metadata retrieval works
- [ ] Watch history aggregation is accurate
- [ ] Collection creation works
- [ ] Collection add/remove items works
- [ ] Collection deletion works
- [ ] Search functionality works
- [ ] Delete from disk works (with test file)

### Performance Testing

- [ ] Watch history for library with 10+ users - response time < 5s
- [ ] Library content for 1000+ items - pagination works
- [ ] Cache invalidation works correctly
- [ ] No memory leaks during extended operation

### Error Handling

- [ ] Invalid URL shows clear error
- [ ] Invalid API key shows authentication error
- [ ] Network timeout handled gracefully
- [ ] Server unavailable handled gracefully
- [ ] Missing item handled (deleted from Jellyfin)

---

## F.7: Documentation Updates

### Files to Create/Update

1. **README.md** - Add Jellyfin setup instructions
2. **docs/JELLYFIN.md** - Detailed Jellyfin configuration guide
3. **CHANGELOG.md** - Document new features
4. **API docs** - Update Swagger definitions

### README.md Update

```markdown
## Supported Media Servers

Maintainerr supports the following media servers:

### Plex
Full feature support including:
- ✅ All rule properties
- ✅ Collection visibility settings
- ✅ Watchlist integration

### Jellyfin
Support with some limitations:
- ✅ Most rule properties
- ✅ Collections (without visibility settings)
- ⚠️ No watchlist support
- ⚠️ Watch history requires user iteration

See [Jellyfin Setup Guide](docs/JELLYFIN.md) for details.
```

### docs/JELLYFIN.md

```markdown
# Jellyfin Setup Guide

## Prerequisites

- Jellyfin Server 10.9.0 or newer
- Admin access to create API keys

## Getting Your API Key

1. Open Jellyfin Dashboard
2. Navigate to **Advanced** → **API Keys**
3. Click **+** to create a new key
4. Name it "Maintainerr"
5. Copy the generated key

## Configuration

1. In Maintainerr, go to **Settings**
2. Select **Jellyfin** as your media server
3. Enter your Jellyfin URL (e.g., `http://jellyfin:8096`)
4. Paste your API key
5. Click **Test Connection**
6. Save settings

## Feature Limitations

### Not Available

- **Collection Visibility**: Jellyfin collections cannot be promoted to Home or Recommended screens
- **Watchlist Rules**: Jellyfin doesn't have a watchlist API

### Performance Considerations

Watch history in Jellyfin is stored per-user. Maintainerr must query each user to determine who watched what. For large user bases, this may be slower than Plex.

**Recommendations:**
- Use caching (enabled by default)
- Consider using Jellystat for centralized stats (future feature)

## Troubleshooting

### Connection Failed

1. Verify Jellyfin URL is accessible from Maintainerr
2. Check API key is valid and not expired
3. Ensure no firewall blocking connection

### Missing Libraries

Jellyfin libraries may take a moment to appear. Try:
1. Refresh the page
2. Check Jellyfin library permissions
```

---

## F.8: Migration Guide

### For Existing Plex Users

No action needed. Existing setup continues to work.

### For New Jellyfin Users

1. Configure media server type as "Jellyfin" in settings
2. Enter Jellyfin URL and API key
3. Test connection
4. Start creating collections

**Note:** Per maintainer guidance, switching between Plex and Jellyfin is not supported.
Users who want to switch servers should start fresh with a new database.

---

## F.9: Acceptance Criteria

- [ ] All unit tests pass with required coverage
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing checklist complete
- [ ] Documentation updated
- [ ] No console errors in UI
- [ ] No unhandled errors in server logs
- [ ] Performance acceptable (<5s for typical operations)

---

## F.10: Release Preparation

### Pre-release Checklist

- [ ] All phases complete and tested
- [ ] Version bump in package.json
- [ ] CHANGELOG.md updated
- [ ] Documentation reviewed
- [ ] Docker image builds successfully

### Release Notes Template

```markdown
## 🎉 Maintainerr 3.0 - Jellyfin Support

### New Features

- **Jellyfin Support**: Connect Maintainerr to your Jellyfin server
- **Media Server Abstraction**: Cleaner architecture supporting multiple servers

### Configuration

- Set media server type in settings
- Configure server URL and API key
- Test connection before saving

### Notes

- Once configured, media server type should not be changed
- To switch servers, start fresh with a new database
- Both Plex and Jellyfin use the same rule properties where possible

### Upgrade Instructions (Existing Users)

1. Backup your database
2. Pull the new image
3. Restart Maintainerr
4. Existing Plex configuration continues to work

### Contributors

Thank you to all contributors who made this possible!
```
