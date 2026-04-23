# Overlay Feature — Technical Documentation

This document describes the overlay functionality added to Maintainerr, covering architecture, data flow, API surface, rendering pipeline, and integration points.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Shared Contracts](#shared-contracts)
4. [Database Schema](#database-schema)
5. [Backend Services](#backend-services)
6. [REST API Endpoints](#rest-api-endpoints)
7. [Plex API Integration](#plex-api-integration)
8. [Rendering Pipeline](#rendering-pipeline)
9. [Scheduling & Events](#scheduling--events)
10. [Frontend UI](#frontend-ui)
11. [Frontend API Layer](#frontend-api-layer)
12. [Collection Integration](#collection-integration)
13. [Docker & Native Dependencies](#docker--native-dependencies)
14. [Bundled Fonts](#bundled-fonts)

---

## Overview

The overlay feature automatically applies visual overlays to media-server posters and title cards for items in Maintainerr collections. Overlays are defined by **templates** — reusable, visually-editable compositions of text, variable, shape, and image elements. Works on both Plex and Jellyfin via the `IOverlayProvider` abstraction. It supports:

- **Template-based design** — a visual Konva.js canvas editor for composing overlay elements
- **Four element types** — static text, variable text (date/countdown), shapes (rectangle/ellipse), and images
- **Poster overlays** — applied to movie/show poster art (1000×1500 canvas, 2:3 aspect ratio)
- **Title card overlays** — applied to episode title cards (1920×1080 canvas, 16:9 aspect ratio)
- **Per-element formatting** — each variable element carries its own date format, locale, and countdown text templates
- **Built-in presets** — 4 preset templates seeded on first run (Classic Pill, Countdown Bar, Corner Badge, Title Card Pill)
- **Template resolution** — per-collection template override → default template for mode → skip
- **Live preview** — server-side rendering of templates onto actual media-server artwork
- **Preview background** — the visual editor can display a real item poster or title card as the canvas background
- **Cron scheduling** — periodic updates to refresh day-countdown labels
- **Original poster backup** — saved to disk so overlays can be cleanly reverted
- **Import/Export** — templates can be shared as JSON files between instances

---

## Architecture

```
packages/contracts/src/overlays/                      ← Zod schemas, TypeScript types, provider DTOs
apps/server/src/modules/overlays/                     ← NestJS module (controller, services, entities)
apps/server/src/modules/overlays/providers/           ← IOverlayProvider abstraction + per-server impls
apps/server/src/modules/api/plex-api/                 ← Plex-specific helpers (used by PlexOverlayProvider)
apps/server/src/modules/api/media-server/jellyfin/    ← Jellyfin adapter + overlay helpers
apps/server/assets/fonts/                             ← Bundled .ttf font files
apps/ui/src/pages/                                    ← OverlayTemplateListPage, OverlayTemplateEditorPage
apps/ui/src/components/OverlayEditor/                 ← OverlayCanvas, ElementToolbox, LayerPanel, PropertiesPanel
apps/ui/src/api/overlays.ts                           ← Frontend API functions
```

The overlay module depends only on `IOverlayProvider`. Server-specific code stays in the providers and their underlying services (`PlexApiService`, `JellyfinAdapterService`); nothing in `modules/overlays/` outside `providers/` imports Plex or Jellyfin types directly.

### Data Flow

```
User creates/edits template in visual editor
  → POST/PUT /api/overlays/templates/:id
  → OverlayTemplateService.create()/update()
  → Template elements stored as JSON in overlay_templates table

Cron fires (or "Run Now" clicked)
  → OverlayProcessorService.processAllCollections()
  → Resolve IOverlayProvider from OverlayProviderFactory (Plex or Jellyfin)
  → For each overlay-enabled collection:
      → mode = collection.type === 'episode' ? 'titlecard' : 'poster'
      → Resolve template: collection.overlayTemplateId → default for mode → skip
      → For each media item:
          → provider.downloadImage(itemId, mode) (or load saved original)
          → Build TemplateRenderContext { deleteDate, daysLeft }
          → OverlayRenderService.renderFromTemplate() ← canvas + sharp
          → provider.uploadImage(itemId, mode, buffer, contentType)
          → Save state in overlay_item_state table
```

---

## Shared Contracts

All overlay types, schemas, and defaults live in `packages/contracts/src/overlays/`.

### Overlay Elements (`overlay-element.ts`)

Elements are the building blocks of templates. Each element has a discriminated `type` field.

#### Base Fields (all elements)

| Field        | Type      | Description                               |
| ------------ | --------- | ----------------------------------------- |
| `id`         | `string`  | Unique element identifier                 |
| `x`          | `number`  | X position in template canvas coordinates |
| `y`          | `number`  | Y position in template canvas coordinates |
| `width`      | `number`  | Width in canvas coordinates (min 1)       |
| `height`     | `number`  | Height in canvas coordinates (min 1)      |
| `rotation`   | `number`  | Rotation in degrees (-360 to 360)         |
| `layerOrder` | `number`  | Z-index (0 = bottom)                      |
| `opacity`    | `number`  | Element opacity (0–1)                     |
| `visible`    | `boolean` | Whether element is rendered               |

#### Text Element (`type: 'text'`)

Static text with font styling and optional background.

| Field               | Type           | Default    | Description                            |
| ------------------- | -------------- | ---------- | -------------------------------------- |
| `text`              | `string`       | —          | Display text                           |
| `fontFamily`        | `string`       | —          | Font family name                       |
| `fontPath`          | `string`       | —          | Font file path (bare name or absolute) |
| `fontSize`          | `number`       | —          | Font size in canvas units              |
| `fontColor`         | `string`       | —          | Text color (hex, supports `#RRGGBBAA`) |
| `fontWeight`        | `enum`         | `"bold"`   | `normal` or `bold`                     |
| `textAlign`         | `enum`         | `"left"`   | `left`, `center`, or `right`           |
| `verticalAlign`     | `enum`         | `"middle"` | `top`, `middle`, or `bottom`           |
| `backgroundColor`   | `string\|null` | `null`     | Background fill color                  |
| `backgroundRadius`  | `number`       | `0`        | Background corner radius               |
| `backgroundPadding` | `number`       | `0`        | Background padding                     |
| `shadow`            | `boolean`      | `false`    | Enable text shadow                     |
| `uppercase`         | `boolean`      | `false`    | Uppercase transformation               |

#### Variable Element (`type: 'variable'`)

Dynamic text with date/countdown substitution. Extends all text element fields plus per-element formatting.

| Field             | Type                | Default         | Description                                 |
| ----------------- | ------------------- | --------------- | ------------------------------------------- |
| `segments`        | `VariableSegment[]` | —               | Array of literal text and variable segments |
| `dateFormat`      | `string`            | `"MMM d"`       | `date-fns` format pattern for `{date}`      |
| `language`        | `string`            | `"en-US"`       | BCP 47 locale for formatting                |
| `enableDaySuffix` | `boolean`           | `false`         | Append English ordinal (st/nd/rd/th)        |
| `textToday`       | `string`            | `"today"`       | Text when 0 days remain                     |
| `textDay`         | `string`            | `"in 1 day"`    | Text when 1 day remains                     |
| `textDays`        | `string`            | `"in {0} days"` | Template for multiple days (`{0}` = count)  |

**Variable Segments** — concatenated at render time:

- `{ type: 'text', value: '...' }` → literal string
- `{ type: 'variable', field: 'date' }` → formatted deletion date
- `{ type: 'variable', field: 'days' }` → integer days remaining
- `{ type: 'variable', field: 'daysText' }` → localised countdown text

#### Shape Element (`type: 'shape'`)

| Field          | Type           | Default       | Description                     |
| -------------- | -------------- | ------------- | ------------------------------- |
| `shapeType`    | `enum`         | `"rectangle"` | `rectangle` or `ellipse`        |
| `fillColor`    | `string`       | —             | Fill color                      |
| `strokeColor`  | `string\|null` | `null`        | Stroke color                    |
| `strokeWidth`  | `number`       | `0`           | Stroke width                    |
| `cornerRadius` | `number`       | `0`           | Corner radius (rectangles only) |

#### Image Element (`type: 'image'`)

| Field       | Type     | Description                                  |
| ----------- | -------- | -------------------------------------------- |
| `imagePath` | `string` | Relative path within `data/overlays/images/` |

### Overlay Templates (`overlay-template.ts`)

| Type                    | Description                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OverlayTemplate`       | Full template with `id`, `name`, `description`, `mode`, `canvasWidth`, `canvasHeight`, `elements[]`, `isDefault`, `isPreset`, `createdAt`, `updatedAt` |
| `OverlayTemplateCreate` | Omits `id`, `isPreset`, `createdAt`, `updatedAt`                                                                                                       |
| `OverlayTemplateUpdate` | Partial — `name?`, `description?`, `elements?`                                                                                                         |
| `OverlayTemplateExport` | Sharing format with `name`, `description`, `mode`, `canvasWidth`, `canvasHeight`, `elements[]`                                                         |
| `OverlayTemplateMode`   | `'poster' \| 'titlecard'`                                                                                                                              |

**Constants:**

| Constant           | Value                           | Description                            |
| ------------------ | ------------------------------- | -------------------------------------- |
| `POSTER_CANVAS`    | `{ width: 1000, height: 1500 }` | Default poster template dimensions     |
| `TITLECARD_CANVAS` | `{ width: 1920, height: 1080 }` | Default title card template dimensions |
| `PRESET_TEMPLATES` | 4 presets                       | Seeded on first run (see below)        |

**Built-in Preset Templates:**

| Name            | Mode      | Description                                            |
| --------------- | --------- | ------------------------------------------------------ |
| Classic Pill    | poster    | Rounded pill in top-left showing "Leaving \<date\>"    |
| Countdown Bar   | poster    | Full-width bar at bottom with uppercase countdown text |
| Corner Badge    | poster    | Small circular badge in top-right with days number     |
| Title Card Pill | titlecard | Rounded pill for episode title cards                   |

### Render Types (`overlay-render.ts`)

| Type                    | Fields                                            | Description                                                                  |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `TemplateRenderContext` | `deleteDate: Date`, `daysLeft: number`            | Raw context passed to renderer; per-element formatting applied during render |
| `OverlayResult`         | `buffer: Uint8Array`, `contentType: 'image/jpeg'` | Rendered output                                                              |

### Settings Schema (`overlay-settings.ts`)

| Field                   | Type                 | Default | Description                                  |
| ----------------------- | -------------------- | ------- | -------------------------------------------- |
| `enabled`               | `boolean`            | `false` | Master switch for overlay processing         |
| `cronSchedule`          | `string\|null`       | `null`  | Cron expression for scheduled runs           |
| `posterOverlayText`     | `OverlayTextConfig`  | —       | Legacy poster text config                    |
| `posterOverlayStyle`    | `OverlayStyleConfig` | —       | Legacy poster style config                   |
| `posterFrame`           | `FrameConfig`        | —       | Legacy poster frame config                   |
| `titleCardOverlayText`  | `OverlayTextConfig`  | —       | Legacy title card text config                |
| `titleCardOverlayStyle` | `OverlayStyleConfig` | —       | Legacy title card style config               |
| `titleCardFrame`        | `FrameConfig`        | —       | Legacy title card frame config               |

---

## Database Schema

### Migration: `1775229600000-AddOverlaySettings`

Creates overlay settings and state tables, adds overlay column to collections.

#### `overlay_settings` table (singleton, id=1)

| Column                  | SQLite Type | Notes                                    |
| ----------------------- | ----------- | ---------------------------------------- |
| `id`                    | INTEGER PK  | Always 1                                 |
| `enabled`               | BOOLEAN     | Default `false`                          |
| `posterOverlayText`     | TEXT (JSON) | Serialized `OverlayTextConfig` (legacy)  |
| `posterOverlayStyle`    | TEXT (JSON) | Serialized `OverlayStyleConfig` (legacy) |
| `posterFrame`           | TEXT (JSON) | Serialized `FrameConfig` (legacy)        |
| `titleCardOverlayText`  | TEXT (JSON) | Serialized `OverlayTextConfig` (legacy)  |
| `titleCardOverlayStyle` | TEXT (JSON) | Serialized `OverlayStyleConfig` (legacy) |
| `titleCardFrame`        | TEXT (JSON) | Serialized `FrameConfig` (legacy)        |
| `cronSchedule`          | VARCHAR     | Nullable                                 |

#### `overlay_item_state` table

Tracks which items have had overlays applied and stores backup references.

| Column               | SQLite Type | Notes                                      |
| -------------------- | ----------- | ------------------------------------------ |
| `id`                 | INTEGER PK  | Auto-increment                             |
| `collectionId`       | INTEGER     | FK → `collection(id)` ON DELETE CASCADE    |
| `mediaServerId`      | VARCHAR     | Plex rating key                            |
| `originalPosterPath` | VARCHAR     | Path to saved original poster (nullable)   |
| `daysLeftShown`      | INTEGER     | Days-left value currently shown (nullable) |
| `processedAt`        | DATETIME    | Auto-set on insert                         |

Unique index: `IDX_overlay_item_state_collection_media` on `(collectionId, mediaServerId)`

#### `collection` table additions

| Column           | Type    | Default |
| ---------------- | ------- | ------- |
| `overlayEnabled` | BOOLEAN | `false` |

### Migration: `1775400000000-AddOverlayTemplates`

Creates the template table and adds per-collection template override.

#### `overlay_templates` table

| Column         | SQLite Type  | Notes                              |
| -------------- | ------------ | ---------------------------------- |
| `id`           | INTEGER PK   | Auto-increment                     |
| `name`         | VARCHAR(100) | Template name                      |
| `description`  | VARCHAR(500) | Optional description               |
| `mode`         | VARCHAR      | `'poster'` or `'titlecard'`        |
| `canvasWidth`  | INTEGER      | Template canvas width (e.g. 1000)  |
| `canvasHeight` | INTEGER      | Template canvas height (e.g. 1500) |
| `elements`     | TEXT (JSON)  | Serialized `OverlayElement[]`      |
| `isDefault`    | BOOLEAN      | Default template for this mode     |
| `isPreset`     | BOOLEAN      | Immutable built-in template        |
| `createdAt`    | DATETIME     | Auto-set                           |
| `updatedAt`    | DATETIME     | Auto-set                           |

#### `collection` table addition

| Column              | Type            | Default                                         |
| ------------------- | --------------- | ----------------------------------------------- |
| `overlayTemplateId` | INTEGER \| NULL | FK → `overlay_templates(id)` ON DELETE SET NULL |

---

## Backend Services

### OverlayTemplateService

Manages overlay templates — CRUD, preset seeding, import/export, defaults.

| Method                                           | Description                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `seedPresets()`                                  | Seeds `PRESET_TEMPLATES` on module init if none exist; sets first poster preset as default |
| `findAll()`                                      | Returns all templates as DTOs                                                              |
| `findById(id)`                                   | Returns a single template or `null`                                                        |
| `findDefault(mode)`                              | Returns the default template for `'poster'` or `'titlecard'`                               |
| `resolveForCollection(overlayTemplateId?, mode)` | **Template resolution**: collection override → default for mode → `null` (skip)            |
| `create(dto)`                                    | Create new template; if `isDefault`, unsets other defaults for same mode                   |
| `update(id, dto)`                                | Update template; rejects edits to preset templates                                         |
| `remove(id)`                                     | Delete template; rejects deletion of presets                                               |
| `duplicate(id)`                                  | Clone template with "Copy of" prefix, non-default, non-preset                              |
| `setDefault(id)`                                 | Set as default for its mode (unsets previous default)                                      |
| `exportTemplate(template)`                       | Returns `OverlayTemplateExport` for JSON sharing                                           |
| `importTemplate(data)`                           | Creates template from `OverlayTemplateExport`                                              |

### OverlaySettingsService

Manages the singleton settings row (general settings: enabled, cron).

| Method                | Description                                      |
| --------------------- | ------------------------------------------------ |
| `getSettings()`       | Returns settings, creates default row if missing |
| `updateSettings(dto)` | Zod-validates partial update, applies to row 1   |

### OverlayStateService

Manages per-item overlay tracking state.

| Method                                                                          | Description                        |
| ------------------------------------------------------------------------------- | ---------------------------------- |
| `getItemState(collectionId, mediaServerId)`                                     | Get state for a specific item      |
| `markProcessed(collectionId, mediaServerId, originalPosterPath, daysLeftShown)` | Upsert: create or update state     |
| `removeState(collectionId, mediaServerId)`                                      | Delete a single state record       |
| `getCollectionStates(collectionId)`                                             | Get all states for a collection    |
| `getAllStates()`                                                                | Get all states                     |
| `clearAllStates()`                                                              | Truncate table                     |
| `removeStatesForCollection(collectionId)`                                       | Delete all states for a collection |

### OverlayRenderService

Image rendering using `canvas` (node-canvas) and `sharp`. See [Rendering Pipeline](#rendering-pipeline).

### OverlayProcessorService

Orchestrates the template-based apply/revert workflow.

| Method                                                             | Description                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `processCollection(collection)`                                    | Resolve template via `templateService.resolveForCollection()`, iterate media, apply overlays. Skips items where `daysLeft` hasn't changed. |
| `processAllCollections()`                                          | Process all overlay-enabled collections. Reverts orphaned items (no longer in any overlay collection). Emits start/finish/fail events.     |
| `applyTemplateOverlay(itemId, collectionId, deleteDate, template, mode, provider)` | Download artwork (or load saved original) via `provider.downloadImage`, render, upload via `provider.uploadImage`, record state |
| `generateTemplatePreview(itemId, template)`                        | Resolve the active provider, download the artwork matching `template.mode`, render with a 14-day sample context                            |
| `revertItem(collectionId, mediaServerId)`                          | Restore original poster for one item                                                                                                       |
| `revertCollection(collectionId)`                                   | Revert all items in a collection                                                                                                           |
| `resetAllOverlays()`                                               | Revert everything, clear all state                                                                                                         |

**Status tracking**: `status` field (`'idle'` | `'running'` | `'error'`), `lastRun`, `lastResult`.

### OverlayTaskService

Extends `TaskBase` for cron scheduling.

| Method                                      | Description                                                |
| ------------------------------------------- | ---------------------------------------------------------- |
| `onBootstrapHook()`                         | Reads settings on startup, sets cron schedule              |
| `executeTask(abortSignal)`                  | Called by cron — runs `processAllCollections()` if enabled |
| `updateCronSchedule(cronSchedule, enabled)` | Hot-update the cron job                                    |

---

## REST API Endpoints

All endpoints are under `@Controller('api/overlays')`.

### Settings

| Method | Path        | Body/Params             | Response          | Description                         |
| ------ | ----------- | ----------------------- | ----------------- | ----------------------------------- |
| GET    | `/settings` | —                       | `OverlaySettings` | Get current settings                |
| PUT    | `/settings` | `OverlaySettingsUpdate` | `OverlaySettings` | Update settings (also updates cron) |

### Plex Helpers

| Method | Path              | Params      | Response                    | Description                                     |
| ------ | ----------------- | ----------- | --------------------------- | ----------------------------------------------- |
| GET    | `/sections`       | —           | `Array<{key, title, type}>` | List Plex library sections                      |
| GET    | `/random-item`    | `sectionId`         | `OverlayPreviewItem \| null` | Random movie/show from section                                  |
| GET    | `/random-episode` | `sectionId`         | `OverlayPreviewItem \| null` | Random episode from section                                     |
| GET    | `/poster`         | `itemId, mode`      | `StreamableFile` (JPEG)     | Proxy the item's artwork for the given mode (editor background) |

### Processing

| Method | Path                     | Params         | Response                        | Description                          |
| ------ | ------------------------ | -------------- | ------------------------------- | ------------------------------------ |
| GET    | `/status`                | —              | `{status, lastRun, lastResult}` | Current processor status             |
| POST   | `/process`               | —              | `ProcessorRunResult`            | Run overlay processing (409 if busy) |
| POST   | `/process/:collectionId` | `collectionId` | `ProcessorRunResult`            | Process single collection            |
| POST   | `/revert/:collectionId`  | `collectionId` | `{success: true}`               | Revert single collection             |
| DELETE | `/reset`                 | —              | `{success: true}`               | Reset all overlays                   |

### Fonts

| Method | Path     | Body                  | Response              | Description                          |
| ------ | -------- | --------------------- | --------------------- | ------------------------------------ |
| GET    | `/fonts` | —                     | `Array<{name, path}>` | List bundled + user fonts            |
| POST   | `/fonts` | Multipart `font` file | `{name, path}`        | Upload custom font (.ttf/.otf/.woff) |

### Templates

| Method | Path                       | Body/Params             | Response                | Description                                |
| ------ | -------------------------- | ----------------------- | ----------------------- | ------------------------------------------ |
| GET    | `/templates`               | —                       | `OverlayTemplate[]`     | List all templates                         |
| GET    | `/templates/:id`           | —                       | `OverlayTemplate`       | Get single template                        |
| POST   | `/templates`               | `OverlayTemplateCreate` | `OverlayTemplate`       | Create new template                        |
| PUT    | `/templates/:id`           | `OverlayTemplateUpdate` | `OverlayTemplate`       | Update template (rejects presets)          |
| DELETE | `/templates/:id`           | —                       | `{success: true}`       | Delete template (rejects presets)          |
| POST   | `/templates/:id/duplicate` | —                       | `OverlayTemplate`       | Clone template                             |
| POST   | `/templates/:id/default`   | —                       | `OverlayTemplate`       | Set as default for its mode                |
| POST   | `/templates/:id/export`    | —                       | `OverlayTemplateExport` | Export template as JSON                    |
| POST   | `/templates/import`        | `OverlayTemplateExport` | `OverlayTemplate`       | Import template from JSON                  |
| POST   | `/templates/:id/preview`   | `query: itemId`         | `StreamableFile` (JPEG) | Render template preview onto actual artwork |

---

## Media Server Integration

The overlay module consumes media servers through a dedicated `IOverlayProvider` abstraction (`apps/server/src/modules/overlays/providers/`). `OverlayProviderFactory` resolves the active provider from the configured media-server type; both Plex and Jellyfin ship implementations.

### `IOverlayProvider` surface

| Method                                             | Purpose                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `isAvailable()`                                    | Reports whether the underlying server is ready                                 |
| `getSections()`                                    | Lists movie/show libraries for the editor's section picker                     |
| `getRandomItem(sectionKeys?)`                      | Random movie or show for poster previews                                       |
| `getRandomEpisode(sectionKeys?)`                   | Random episode for title-card previews                                         |
| `downloadImage(itemId, mode)`                      | Bytes of the artwork the mode targets (`poster` or `titlecard`); `null` if none |
| `uploadImage(itemId, mode, buffer, contentType)`   | Atomically replaces the artwork for the mode                                    |

### PlexOverlayProvider

Delegates to existing helpers on `PlexApiService` — no new Plex logic. The `mode` parameter is intentionally unused: a Plex item's own `thumb` is the correct artwork for any mode (movies/shows use the poster `thumb`; episodes use the title-card `thumb`).

| Interface method                  | Underlying call                                           |
| --------------------------------- | --------------------------------------------------------- |
| `isAvailable`                     | `PlexApiService.isPlexSetup`                              |
| `getSections`                     | `PlexApiService.getOverlayLibrarySections`                |
| `getRandomItem`                   | `PlexApiService.getRandomLibraryItem`                     |
| `getRandomEpisode`                | `PlexApiService.getRandomEpisodeItem`                     |
| `downloadImage(_, _mode)`         | `getBestPosterUrl` → `downloadPoster`                     |
| `uploadImage(_, _mode, buf, ct)`  | `setThumb` (upload → diff → select with dedup/retry loop) |

### JellyfinOverlayProvider

Wraps four public helpers on `JellyfinAdapterService`:

| Adapter method                                                  | Purpose                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `findRandomItem(sectionIds, kinds)`                             | `getItems` with `ItemSortBy.Random`, configurable `BaseItemKind[]`, Virtual locations excluded   |
| `findRandomEpisode(sectionIds)`                                 | Same with `includeItemTypes: [Episode]`                                                          |
| `getItemImageBuffer(itemId, imageType)`                         | `getItemImage` with `format: Jpg` + `responseType: 'arraybuffer'`, 404 → `null`                  |
| `setItemImage(itemId, imageType, buffer, contentType)`          | `setItemImage` with raw Buffer body + explicit `Content-Type` (matches OpenAPI `image/*` binary contract) |

Mode → `ImageType` mapping lives only in `JellyfinOverlayProvider.imageTypeFor()`:

- `poster` → `ImageType.Primary`
- `titlecard` → `ImageType.Thumb`

Keeping the `ImageType` parameter at the adapter layer (not at `IOverlayProvider`) preserves the rule that Jellyfin SDK types don't leak outside `jellyfin/`.

### Server differences hidden behind the interface

- **Upload semantics.** Plex uses upload → diff → select with content-addressed dedup and retries. Jellyfin replaces the image atomically with one request.
- **Artwork taxonomy.** Plex's item `thumb` covers both modes. Jellyfin splits by `ImageType`; the provider does the mapping.

---

## Rendering Pipeline

The `OverlayRenderService` uses **node-canvas** for text/shape rendering and **sharp** for image composition.

### `renderFromTemplate(posterBuffer, elements, canvasWidth, canvasHeight, context)` Pipeline

This is the primary render method used by the processor. It composites all visible template elements onto a poster.

1. **Read poster dimensions** via `sharp(posterBuffer).metadata()` → get actual width/height
2. **Calculate scale factors** — `scaleX = posterWidth / canvasWidth`, `scaleY = posterHeight / canvasHeight`
3. **Sort elements** by `layerOrder` ascending (bottom-up), filter to `visible: true`
4. **For each element**, compute scaled position (`sx`, `sy`) and size (`sw`, `sh`):
   - Scale: `sx = Math.round(el.x * scaleX)`, `sw = Math.max(1, Math.round(el.width * scaleX))`, etc.
5. **Render element to buffer** based on type:
   - `renderTextElement()` — canvas text with optional background pill, font styling
   - `renderVariableElement()` — resolves segments (`{date}`, `{days}`, `{daysText}`) using per-element formatting config, then renders as text
   - `renderShapeElement()` — rectangle or ellipse with fill/stroke
   - `renderImageElement()` — loads image from disk, resizes with `sharp.resize()`
6. **Apply rotation** — `sharp.rotate(el.rotation)` with transparent background
7. **Apply opacity** — pixel-level alpha channel modulation via `applyOpacity()`
8. **Clamp to poster bounds** — after rotation (which can increase buffer dimensions), the code:
   - Reads actual layer dimensions via `sharp.metadata()`
   - Handles negative offsets by extracting the visible sub-region
   - Trims layers that extend beyond the poster edges
   - Uses `sharp.extract()` to crop to the visible portion
   - Skips invisible layers (0 width or height)
9. **Composite all layers** via `sharp.composite()` with `blend: 'over'`
10. **Output JPEG** at quality 92

### Element Rendering Details

#### Variable Text Resolution

Variable elements use `segments[]` — an array of literal text and variable references, concatenated at render time. Each element carries its own formatting configuration:

- `formatElementDate(el, deleteDate)` — uses `el.dateFormat` and `el.language` with `date-fns` formatting; optionally adds English ordinal suffix if `el.enableDaySuffix` is true
- `formatElementDaysText(el, daysLeft)` — returns `el.textToday` (0 days), `el.textDay` (1 day), or `el.textDays` with `{0}` substitution

### Legacy `renderOverlay(posterBuffer, opts)` Pipeline

The legacy pill-based render method is still present for backward compatibility but is no longer used by the processor. It renders a single text pill with percentage-based sizing and optional frame.

### Font Resolution

The `getFontFamily(fontPath)` method resolves font files:

1. Check cache (already registered fonts)
2. If absolute path, check `fs.existsSync` directly
3. If bare filename (e.g. `"Inter-Bold.ttf"`):
   - Check bundled fonts dir (`apps/server/assets/fonts/`)
   - Check user fonts dir (`{DATA_DIR}/overlays/fonts/`)
4. Register with `registerFont(resolvedPath, { family })` from node-canvas
5. Falls back to `'sans-serif'` if not found

---

## Scheduling & Events

### Cron Scheduling

- `OverlayTaskService` extends `TaskBase` and registers as a scheduled task
- On bootstrap, reads `settings.cronSchedule` and configures the cron job
- Default cron is `'0 0 0 1 1 *'` (disabled — Jan 1 only)
- When settings are saved with a new `cronSchedule`, `updateCronSchedule()` hot-updates the job
- When the cron fires, `executeTask()` calls `processAllCollections()`

### Emitted Events

| Event                     | When                             |
| ------------------------- | -------------------------------- |
| `OverlayHandler_Started`  | Processor run begins             |
| `OverlayHandler_Finished` | Processor run completes          |
| `OverlayHandler_Failed`   | Processor run fails with error   |
| `Overlay_Applied`         | Individual item overlay applied  |
| `Overlay_Reverted`        | Individual item overlay reverted |

---

## Frontend UI

### Routes

```
/settings/overlays                    → OverlayTemplateListPage (template list + settings)
/settings/overlays/templates          → redirects to /settings/overlays
/settings/overlays/templates/:id      → OverlayTemplateEditorPage (visual editor)
/settings/overlays/templates/new      → OverlayTemplateEditorPage (new template)
```

All routes are lazy-loaded under the `<Settings />` wrapper component.

### Template List Page (`apps/ui/src/pages/OverlayTemplateListPage.tsx`)

The main entry point for the overlay feature. Combines template management with general settings.

#### Page Structure

```
┌─ Header ────────────────────────────────────────┐
│  Overlay Templates    [Settings ▾] [Import] [+] │
└─────────────────────────────────────────────────┘
┌─ Collapsible Settings Panel ────────────────────┐
│  [x] Enable overlays                             │
│  Cron schedule: [________________]               │
│  [Save Settings] [Run Now] [Reset All]           │
└─────────────────────────────────────────────────┘

┌─ Poster Templates ──────────────────────────────┐
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Classic  │  │Countdown │  │  Corner  │      │
│  │  Pill    │  │   Bar    │  │  Badge   │      │
│  │ [Edit] [★] [⤓] [🗑] │  │ ...      │      │
│  └──────────┘  └──────────┘  └──────────┘      │
└─────────────────────────────────────────────────┘

┌─ Title Card Templates ──────────────────────────┐
│  ┌──────────┐                                    │
│  │Title Card│                                    │
│  │  Pill    │                                    │
│  └──────────┘                                    │
└─────────────────────────────────────────────────┘
```

#### Key Behaviors

- **Settings panel** — collapsed by default, toggled via "Settings" button with gear icon
- **Settings form** — React Hook Form with `zodResolver(overlaySettingsSchema)` for `enabled`, `cronSchedule`
- **Template cards** — grouped by mode (poster/titlecard), showing name, description, element count, canvas dimensions, default/preset badges
- **Actions per card** — Edit (or View for presets), Duplicate, Set Default, Export, Delete
- **Import** — hidden file input accepting `.json` files parsed as `OverlayTemplateExport`
- **Processing** — "Run Now" triggers `processAllOverlays()`, "Reset All" triggers `resetAllOverlays()` with confirmation dialog

### Template Editor Page (`apps/ui/src/pages/OverlayTemplateEditorPage.tsx`)

A visual canvas editor for designing overlay templates.

#### Page Structure

```
┌─ Top Bar ───────────────────────────────────────┐
│  ← Templates [Name___] [Mode▾]                  │
│                    📷 [Library▾] [↻]             │
│                          [↶] [↷] [Save]         │
└─────────────────────────────────────────────────┘
┌─ Editor ────────────────────────────────────────┐
│ ┌─Toolbox─┐ ┌─────── Canvas ────────┐ ┌─Right─┐│
│ │ + Text  │ │                        │ │Layers ││
│ │ + Var   │ │  ┌──────────────┐     │ │ layer1││
│ │ + Shape │ │  │  poster bg   │     │ │ layer2││
│ │ + Image │ │  │  + elements  │     │ │───────││
│ │         │ │  └──────────────┘     │ │Props  ││
│ │         │ │                        │ │ x,y,w ││
│ │         │ │                        │ │ font  ││
│ └─────────┘ └────────────────────────┘ └───────┘│
└─────────────────────────────────────────────────┘
```

#### Key Behaviors

- **Top bar** — template name input, mode selector (poster/titlecard, new templates only), Plex poster background picker, undo/redo, save
- **Preview background** — section dropdown loads library sections via `getOverlaySections()`, selecting a section auto-fetches a random item via `getRandomItem()`/`getRandomEpisode()`. Refresh button loads a different one. Image is proxied through `GET /api/overlays/poster?itemId=...&mode=poster|titlecard`
- **Canvas** — Konva.js `Stage` with interactive drag/transform; scales template canvas to fit display (max 600px height)
- **Element toolbox** — buttons to add text, variable, shape, or image elements with sensible defaults
- **Layer panel** — ordered layer list with visibility toggle, reorder (move up/down by swapping `layerOrder`), delete
- **Properties panel** — context-sensitive form for the selected element's properties (type-specific fields)
- **Undo/redo** — custom `useUndoRedo<OverlayElement[]>` hook, keyboard shortcuts: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y
- **Delete** — Delete/Backspace key deletes selected element (only when body is focused, to avoid conflicts with text inputs)
- **Preset protection** — preset templates show "View" (not "Edit"), save is disabled

### Overlay Editor Components (`apps/ui/src/components/OverlayEditor/`)

| Component         | Props                                                                                             | Description                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `OverlayCanvas`   | `elements`, `canvasWidth`, `canvasHeight`, `selectedId`, `onSelect`, `onUpdate`, `backgroundUrl?` | Konva.js Stage with background image, element rendering, transformer, drag/resize                  |
| `ElementToolbox`  | `mode`, `onAdd`, `nextLayerOrder`                                                                 | Buttons to add new elements with default values                                                    |
| `LayerPanel`      | `elements`, `selectedId`, `onSelect`, `onReorder`, `onDelete`                                     | Sortable layer list with visibility and ordering controls                                          |
| `PropertiesPanel` | `element`, `onChange`                                                                             | Type-discriminated property editor (text props, variable segment editor, shape props, image props) |

---

## Frontend API Layer

All functions in `apps/ui/src/api/overlays.ts`:

### Settings

| Function                      | HTTP                     | Description                     |
| ----------------------------- | ------------------------ | ------------------------------- |
| `getOverlaySettings()`        | `GET /overlays/settings` | Fetch current settings          |
| `updateOverlaySettings(data)` | `PUT /overlays/settings` | Save settings (returns updated) |

### Plex Helpers

| Function                      | HTTP                           | Description                       |
| ----------------------------- | ------------------------------ | --------------------------------- |
| `getOverlaySections()`        | `GET /overlays/sections`       | List Plex library sections        |
| `getRandomItem(sectionId)`    | `GET /overlays/random-item`    | Random movie/show for preview     |
| `getRandomEpisode(sectionId)` | `GET /overlays/random-episode` | Random episode for preview        |
| `buildItemImageUrl(itemId, mode)` | —                              | Construct artwork proxy URL string for the given mode |

### Processing

| Function               | HTTP                     | Description                 |
| ---------------------- | ------------------------ | --------------------------- |
| `processAllOverlays()` | `POST /overlays/process` | Trigger full processing run |
| `resetAllOverlays()`   | `DELETE /overlays/reset` | Revert all overlays         |
| `getOverlayStatus()`   | `GET /overlays/status`   | Get processor status        |

### Fonts

| Function            | HTTP                  | Description          |
| ------------------- | --------------------- | -------------------- |
| `getOverlayFonts()` | `GET /overlays/fonts` | List available fonts |

### Templates

| Function                                          | HTTP                                     | Description           |
| ------------------------------------------------- | ---------------------------------------- | --------------------- |
| `getOverlayTemplates()`                           | `GET /overlays/templates`                | List all templates    |
| `getOverlayTemplate(id)`                          | `GET /overlays/templates/:id`            | Fetch single template |
| `createOverlayTemplate(data)`                     | `POST /overlays/templates`               | Create new template   |
| `updateOverlayTemplate(id, data)`                 | `PUT /overlays/templates/:id`            | Update template       |
| `deleteOverlayTemplate(id)`                       | `DELETE /overlays/templates/:id`         | Delete template       |
| `duplicateOverlayTemplate(id)`                    | `POST /overlays/templates/:id/duplicate` | Clone template        |
| `setDefaultOverlayTemplate(id)`                   | `POST /overlays/templates/:id/default`   | Set as default        |
| `exportOverlayTemplate(id)`                       | `POST /overlays/templates/:id/export`    | Export as JSON        |
| `importOverlayTemplate(data)`                     | `POST /overlays/templates/import`        | Import from JSON      |
| `buildTemplatePreviewUrl(id, itemId, cacheBust?)` | —                                        | Construct preview URL |

---

## Collection Integration

### Entity Changes

The `Collection` entity has two overlay-related columns:

```typescript
@Column({ nullable: false, default: false })
overlayEnabled: boolean;

@Column({ nullable: true, default: null })
overlayTemplateId: number | null;

@ManyToOne(() => OverlayTemplateEntity, { nullable: true, onDelete: 'SET NULL' })
@JoinColumn({ name: 'overlayTemplateId' })
overlayTemplate: OverlayTemplateEntity | null;
```

### Template Resolution

When processing a collection, the processor resolves the template to use via `OverlayTemplateService.resolveForCollection()`:

1. **Collection override** — if `collection.overlayTemplateId` is set and the template exists, use it
2. **Default for mode** — fall back to the default template for the collection's mode (`poster` or `titlecard`)
3. **Skip** — if no template is found, the collection is skipped with a warning

### Service Method

`CollectionsService.getCollectionsWithOverlayEnabled()` fetches collections with `overlayEnabled: true` and `isActive: true`, then loads their `collectionMedia` via `CollectionMediaRepo`.

### Rules Integration

Both `setRules()` (create) and `updateRules()` (update) in `RulesService` pass `overlayEnabled` and `overlayTemplateId` through to collection creation/update.

### ICollection Interface

`overlayEnabled?: boolean` and `overlayTemplateId?: number | null` are included in the `ICollection` interface.

### UI Checkbox

The Rule Group AddModal includes an "Enable overlays" checkbox and an optional template selector:

- Zod schema: `overlayEnabled: z.boolean()`, `overlayTemplateId: z.number().nullable()`
- Payload: included in the collection object sent to the API

---

## Docker & Native Dependencies

### Build Stage Dependencies

```dockerfile
RUN apk add --no-cache \
  build-base python3 pkgconfig \
  cairo-dev pango-dev jpeg-dev giflib-dev pixman-dev librsvg-dev
```

Required for compiling `canvas` (node-canvas) native addon.

### Runtime Dependencies

```dockerfile
RUN apk add --no-cache \
  cairo pango jpeg giflib pixman librsvg
```

Required at runtime for canvas rendering and sharp image processing.

### Font Asset Copy

```dockerfile
COPY --from=builder /app/apps/server/assets ./apps/server/dist/assets
```

Copies bundled fonts into the production image.

---

## Bundled Fonts

Located at `apps/server/assets/fonts/`:

| Font File            | Family          |
| -------------------- | --------------- |
| `Inter-Bold.ttf`     | Inter (default) |
| `Inter-Medium.ttf`   | Inter           |
| `Inter-Regular.ttf`  | Inter           |
| `Roboto-Bold.ttf`    | Roboto          |
| `Roboto-Medium.ttf`  | Roboto          |
| `Roboto-Regular.ttf` | Roboto          |
| `Comfortaa-Bold.ttf` | Comfortaa       |

Users can upload additional fonts (.ttf, .otf, .woff) via `POST /api/overlays/fonts`. Uploaded fonts are stored at `{DATA_DIR}/overlays/fonts/`.

---

## Original Poster Management

When an overlay is first applied to an item:

1. The original artwork is downloaded via the active `IOverlayProvider.downloadImage()`
2. Saved to `{DATA_DIR}/overlays/originals/{mediaServerId}.jpg`
3. On subsequent re-applications (e.g. countdown day change), the saved original is used as the base to prevent overlay stacking
4. On revert, the saved original is uploaded back via `IOverlayProvider.uploadImage()` and the backup file is deleted

This ensures overlays are always cleanly reversible on both Plex and Jellyfin.
