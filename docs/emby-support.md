# Emby Support - Technical Documentation

This document covers the addition of Emby as a third supported media server
in Maintainerr alongside Plex and Jellyfin. It records what was built, why
the structural choices were made, what is verified, what is unverified, and
where future maintainers should look first when triaging Emby-specific bugs.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture & layering](#architecture--layering)
3. [Design decisions](#design-decisions)
4. [What was verified vs scaffolded](#what-was-verified-vs-scaffolded)
5. [Why Emby Connect is not implemented](#why-emby-connect-is-not-implemented)
6. [Database migration](#database-migration)
7. [Logo + licensing](#logo--licensing)
8. [CodeQL alerts (false positives)](#codeql-alerts-false-positives)
9. [Testing scripts & how to verify locally](#testing-scripts--how-to-verify-locally)
10. [Known gaps / future work](#known-gaps--future-work)
11. [Bug history during the PR](#bug-history-during-the-pr)
12. [Commit log](#commit-log)
13. [File inventory](#file-inventory)

---

## Overview

Maintainerr previously supported Plex and Jellyfin through the
`IMediaServerService` abstraction in `apps/server/src/modules/api/media-server/`.
This change adds Emby as a third adapter slotted into the same abstraction,
plus the matching UI, settings, rule-evaluation, and migration plumbing.

End-user surface:

- New "Emby" tile in the media-server selector
- Dedicated `/settings/emby` settings page with the same shape as the Jellyfin
  page (URL + API key + admin user dropdown + Test/Save + "Sign in with Emby"
  credentials login)
- Emby application appears in the rule creator with its own properties
- Switch flow handles Emby ↔ Plex and Emby ↔ Jellyfin in both directions,
  migrating rule property IDs across servers

Server surface:

- `EmbyAdapterService` implementing all 40 methods of `IMediaServerService`
- `EmbyApi` helper at `apps/server/src/modules/api/emby-api/emby-api.helper.ts`
  that wraps `axios.create`, matching the `plex-api/` / `tautulli-api/` layout
- `EmbyGetterService` mirroring `JellyfinGetterService` for rule-property
  evaluation (50+ property cases)
- `EmbyOverlayProvider` for collection-poster uploads
- TypeORM migration adding four nullable `emby_*` columns to the `settings`
  table

PR: [#2911](https://github.com/Maintainerr/Maintainerr/pull/2911) on the
`emby-support` branch.

---

## Architecture & layering

```
        Settings / Rules / Collections / UI controllers
                            │
              MediaServerFactory (routes by MediaServerType)
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
   PlexAdapterService   JellyfinAdapter   EmbyAdapterService
            │               │               │
      PlexApi (npm)   @jellyfin/sdk    EmbyApi (this repo)
                                              │
                                       axios.create({baseURL})
                                              │
                                       Emby HTTP API
```

- `MediaServerFactory.getService()` reads `settings.media_server_type` and
  returns the matching adapter. The factory was extended with an `EMBY` case
  and a third `embyAdapter` injection.
- `EmbyAdapterService` (in `modules/api/media-server/emby/`) implements
  `IMediaServerService`. It delegates HTTP construction to `EmbyApi`.
- `EmbyApi` (in `modules/api/emby-api/`) is a small class that builds the
  `axios` instance with the right headers and base URL. It mirrors how
  `PlexApiService` wraps the npm `plex-api` package and how `TautulliApi`
  extends `ExternalApiService`.
- `EmbyGetterService` (in `modules/rules/getter/`) implements the per-property
  read paths used by the rule executor. It is registered alongside the other
  per-server getters in `RulesModule` and dispatched from `ValueGetterService`.

### Cross-cutting touchpoints

The following pre-existing files were extended with Emby cases:

| File                                                                     | Change                                                                                                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `packages/contracts/src/media-server/enums.ts`                           | `MediaServerType.EMBY = 'emby'`                                                                                                                     |
| `packages/contracts/src/media-server/features.ts`                        | Emby entry in the feature matrix                                                                                                                    |
| `packages/contracts/src/rules/constants.ts`                              | `Application.EMBY = 7` + ApplicationNames                                                                                                           |
| `apps/server/src/modules/api/lib/cache.ts`                               | `emby` cache in the static registry                                                                                                                 |
| `apps/server/src/modules/api/media-server/media-server-id.utils.ts`      | `isLikelyEmbyId`, `isForeignServerId`/`shouldRefreshMetadataItemId` Emby branches                                                                   |
| `apps/server/src/modules/api/media-server/media-server.factory.ts`       | `EmbyAdapterService` injection + EMBY case in switches                                                                                              |
| `apps/server/src/modules/api/media-server/media-server.module.ts`        | `EmbyModule` import + provider                                                                                                                      |
| `apps/server/src/modules/overlays/providers/overlay-provider.factory.ts` | EMBY case                                                                                                                                           |
| `apps/server/src/modules/overlays/providers/overlay-provider.module.ts`  | `EmbyOverlayProvider` provider                                                                                                                      |
| `apps/server/src/modules/rules/constants/rules.constants.ts`             | Constructor pushes an Emby application that shares Jellyfin's `props[]`                                                                             |
| `apps/server/src/modules/rules/getter/getter.service.ts`                 | EMBY case in dispatch + `EmbyGetterService` injection                                                                                               |
| `apps/server/src/modules/rules/rules.module.ts`                          | `EmbyGetterService` provider                                                                                                                        |
| `apps/server/src/modules/rules/rules.service.ts`                         | Cache-reset branch for `emby` cache                                                                                                                 |
| `apps/server/src/modules/rules/tasks/rule-executor.service.ts`           | Empty-children BoxSet sync-lag workaround now covers Emby as well as Jellyfin                                                                       |
| `apps/server/src/modules/settings/entities/settings.entities.ts`         | `emby_url`, `emby_api_key`, `emby_user_id`, `emby_server_name` columns                                                                              |
| `apps/server/src/modules/settings/media-server-switch.service.ts`        | Null `emby_*` columns when switching away from Emby                                                                                                 |
| `apps/server/src/modules/settings/rule-migration.service.ts`             | EMBY mapping in `getApplicationId` + `detectRuleSourceApp`                                                                                          |
| `apps/server/src/modules/settings/settings.controller.ts`                | Routes for `/api/settings/emby[/test                                                                                                                | /login]` |
| `apps/server/src/modules/settings/settings.service.ts`                   | `testEmby`, `loginEmby`, `saveEmbySettings`, `removeEmbySettings`, hydration, auto-detect, secret masking, `testSetup`, `testMediaServerConnection` |
| `apps/ui/src/api/settings.ts`                                            | `EmbySetting`, `useEmbySettings`, `useTestEmby`, `useSaveEmbySettings`, `useDeleteEmbySettings`, `useLoginEmby` hooks                               |
| `apps/ui/src/components/Common/MediaCard/MediaModal/index.tsx`           | Emby deep-link branch                                                                                                                               |
| `apps/ui/src/components/Layout/MediaServerSetupGuard.tsx`                | EMBY case in `getMediaServerSetupRoute`                                                                                                             |
| `apps/ui/src/components/Rules/Rule/RuleCreator/RuleInput/index.tsx`      | `shouldFilterApplication` updated to filter rule properties by server type with `isEmby` flag                                                       |
| `apps/ui/src/components/Settings/MediaServerSelector/index.tsx`          | Third selector option + `nameOf()` lookup replacing two-server ternaries                                                                            |
| `apps/ui/src/components/Settings/index.tsx`                              | Emby tab, path detection, setup route                                                                                                               |
| `apps/ui/src/hooks/useMediaServerType.ts`                                | `isEmby` flag                                                                                                                                       |
| `apps/ui/src/router.tsx`                                                 | `/settings/emby` lazy route                                                                                                                         |
| `ARCHITECTURE.md`                                                        | Flowchart + module list updated                                                                                                                     |

---

## Design decisions

### 1. Separate adapter, separate getter - no shared base

Emby and Jellyfin share a common ancestor (Jellyfin forked Emby in 2018) and
the Emby getter ended up as essentially a 1:1 port of the Jellyfin getter.
The temptation to extract a shared `JellyfinLikeGetterBase` was explicitly
**rejected**:

- The fork is seven years old and the APIs will continue to diverge.
- A shared base either gets polluted with subclass branches when the first
  divergence appears, or gets forked back anyway - and the "refactor back"
  cost is higher than the duplicated-fix cost.
- Keeping three distinct servers (Plex, Jellyfin, Emby) as three distinct
  code paths matches the existing project convention and the architecture
  guardrail "Use `supportsFeature()` for conditional behaviour - never
  branch on server type in the shared layer".

The cost is real: every bug fix in `JellyfinGetterService` needs a parallel
fix in `EmbyGetterService`. That's the accepted trade.

### 2. EmbyApi helper in `modules/api/emby-api/`

The first draft constructed `axios.create({baseURL: userUrl})` directly
inside `EmbyAdapterService`. That worked but didn't match the established
layering - `PlexApiService` wraps the `plex-api` npm package, and
`TautulliApi` extends `ExternalApiService`. The HTTP-client construction
was extracted into a small `EmbyApi` helper class at
`apps/server/src/modules/api/emby-api/emby-api.helper.ts`, and
`EmbyAdapterService` now instantiates it and reads `.axios`.

### 3. `Application.EMBY = 7` + shared rule property list

`Application.EMBY` was added to the rules `Application` enum with id `7`.
The Emby application is registered in `RuleConstants` via the constructor;
it shares the **same `props[]` array reference** as the Jellyfin application:

```ts
this.applications.push({
  id: Application.EMBY,
  name: "Emby",
  mediaType: MediaType.BOTH,
  props: jellyfinApp.props,
});
```

This means rule migration between Jellyfin and Emby is a property-ID no-op
(both sides have the same numeric IDs for the same property names).
`rule-migration.service.ts` maps `MediaServerType.EMBY` → `Application.EMBY`
in `getApplicationId`, and `detectRuleSourceApp` accepts EMBY alongside the
existing two.

### 4. Login UI follows the existing Plex login pattern

A dedicated `EmbyLoginButton` lives at `apps/ui/src/components/Login/Emby/`,
mirroring `Login/Plex/PlexLoginButton`. The settings page (`Settings/Emby/`)
renders that button next to the `TestingButton` and `SaveButton`. Login UX
collects admin username/password, POSTs to `/api/settings/emby/login`, and
on success populates the URL + API-key fields and the admin-user dropdown
in the parent form.

### 5. Empty-children sync-lag workaround applies to Emby too

`rule-executor.service.ts` had a Jellyfin-only workaround for cases where
the BoxSet API momentarily returns empty children right after a write,
which previously caused valid items to be flagged as "manually removed".
Emby shares the same .NET BoxSet backend so the workaround now covers both:

```ts
const isJellyfin = this.settings.media_server_type === MediaServerType.JELLYFIN;
const isEmby = this.settings.media_server_type === MediaServerType.EMBY;
const shouldCheckRemovals =
  isJellyfin || isEmby ? children && children.length > 0 : true;
```

The two flags are kept separate (not folded into one) so future divergence
between the two servers' behaviour stays expressible without a rename.

### 6. ReDoS regex replaced with string ops

`url.replace(/\/+$/, '')` was flagged by CodeQL as polynomial regex on
user-controlled input. Replaced with the codebase's established
`while + endsWith + slice` pattern (see PR #2526 `normalizeDiskPath` and
`modules/api/lib/requestLogging.ts:describeRequestTarget`):

```ts
let cleanUrl = url;
while (cleanUrl.endsWith("/")) cleanUrl = cleanUrl.slice(0, -1);
```

### 7. Cache key namespace

A new `'emby'` cache type was added to the static registry in
`modules/api/lib/cache.ts` (matching the `'jellyfin'` entry pattern).
Cache invalidation in `rules.service.ts:requiresCacheReset` flushes
`cacheManager.getCache('emby')` for the Emby case.

---

## What was verified vs scaffolded

### Verified against a live Emby Server 4.9.3.0

- Connection test (`POST /api/settings/emby/test`) → server name + version + admin user list
- Credentials login (`POST /api/settings/emby/login` → `POST /Users/AuthenticateByName`) → access token + libraries + users
- Settings save + persistence (the four `emby_*` columns)
- Media-server endpoints with Emby active: `/libraries`, `/users`, `/` (status), `/library/:id/content` (real Shows library returned mapped items)
- Rule creation against an Emby library (`firstVal: [7, 0]`, "Date added")
- Rule executor run end-to-end (no errors, walked the full adapter path)
- Media-server switch: Emby ↔ Jellyfin in both directions, rule migration `[7, X]` ↔ `[6, X]`, DB state verified
- Full UI walkthrough - 0 console errors with Emby configured
- 5 screenshots captured via Playwright MCP and embedded in the PR description

### Scaffolded but unverified

Each unverified path is marked `TODO(emby-server-test):` in the code (10 sites).

| Surface                                                                                                                                                       | Status                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collection write paths (`createCollection`, `addToCollection`, `removeFromCollection`, `updateCollection`, `deleteCollection`, `cleanupCollectionForLibrary`) | Code exists, endpoints look right per Emby docs, never hit a real Emby for confirmation                                                                                                                                                                                                                                                             |
| `setCollectionImage`                                                                                                                                          | Coded as base64 POST body with original Content-Type; unverified                                                                                                                                                                                                                                                                                    |
| `deleteFromDisk`, `refreshItemMetadata`                                                                                                                       | Coded, unverified                                                                                                                                                                                                                                                                                                                                   |
| `getWatchHistory` per-user iteration, `getWatchState`, `getItemSeenBy`                                                                                        | Coded, unverified at scale                                                                                                                                                                                                                                                                                                                          |
| `computeLibraryStorageSizes`                                                                                                                                  | Coded, may report misleading totals if the `Size` field aggregates differently than expected                                                                                                                                                                                                                                                        |
| `getAllIdsForContextAction` (show ↔ episode traversal)                                                                                                        | Coded, unverified                                                                                                                                                                                                                                                                                                                                   |
| `EmbyGetterService` - all 50+ property cases                                                                                                                  | Ported 1:1 from the verified `JellyfinGetterService`; structurally correct but the underlying adapter HTTP calls are unverified                                                                                                                                                                                                                     |
| `EmbyOverlayProvider`                                                                                                                                         | `isAvailable`, `getSections`, image upload have implementations; `getRandomItem`, `getRandomEpisode`, `downloadImage` return `null` with a TODO. Item-existence checks go through the shared `IMediaServerService.itemExists` (backed by `EmbyAdapterService`), not the provider                                                                    |
| `supportsFeature()` matrix                                                                                                                                    | Conservative defaults matching Jellyfin: COLLECTION_VISIBILITY, WATCHLIST, CENTRAL_WATCH_HISTORY, COLLECTION_SORT all off. The COLLECTION_SORT note is updated to reflect that Emby has no item-move endpoint (only DisplayOrder = PremiereDate \| SortName), so Maintainerr's "push an ordered list of IDs" contract is structurally unsatisfiable |

### Tests landed in this PR

These specs cover the in-process Maintainerr logic that branches on
`MediaServerType.EMBY` - none of them call out to a live Emby server, so they
verify _Maintainerr's_ behaviour when configured for Emby rather than what
Emby itself returns:

| Spec                                             | What it pins                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media-server.factory.spec.ts` (extended)        | Emby routing via `getServiceByType(EMBY)`, init-then-return path, uninitialize dispatch, configured-type inference from `emby_*` columns. Also fixes a stale "unsupported type" test that used `'EMBY'` as the example string                                                                         |
| `media-server-switch.service.spec.ts` (extended) | All four Emby switch directions (Plex→Emby, Jellyfin→Emby, Emby→Plex, Emby→Jellyfin) clear the right column sets                                                                                                                                                                                      |
| `rule-migration.service.spec.ts` (extended)      | Emby ↔ Plex migrations, Emby ↔ Jellyfin no-op remaps (shared `props[]` reference), incompatible-property skip + delete, EMBY source detection for community imports, `getApplicationId(EMBY)` resolution                                                                                              |
| `rules.service.cacheReset.spec.ts` (new)         | `resetCacheIfGroupUsesRuleThatRequiresIt` flushes `getCache('emby')` when configured for Emby (with peer assertions for Plex and Jellyfin so the dispatch table is fully covered)                                                                                                                     |
| `emby.mapper.spec.ts` (new)                      | The pure `EmbyBaseItemDto → MediaItem/MediaLibrary/MediaCollection/MediaPlaylist/MediaUser/MediaServerStatus/WatchRecord` transforms, including parent/grandparent semantics, RunTimeTicks→ms conversion, AspectRatio parsing, Tags→labels mapping, and the "Emby has no smart collections" invariant |
| `Settings.spec.tsx` (extended)                   | Emby render path - when `media_server_type === EMBY` the desktop tab list contains "Emby" and not "Plex"/"Jellyfin", and the link points at `/settings/emby`                                                                                                                                          |

---

## Why Emby Connect is not implemented

The original plan included Emby Connect (the emby.media cloud-account flow)
as an MVP feature, citing an `embyconnect.ts` reference implementation in
Seerr. **That file does not exist** - verified via the GitHub API against
[Seerr](https://github.com/seerr-team/seerr/tree/develop/server/api).
The repo has no dedicated Emby Connect module, and `jellyfin.ts`
contains any references to `api.emby.media`, `/service/`, or
`X-Connect-UserToken`.

Rather than ship guessed `api.emby.media` code as if it were verified, the
Connect flow was removed entirely. The previously-added
`EmbyConnectService`, controller endpoints (`/emby/connect/login`,
`/emby/connect/exchange`), and UI Connect modal were all deleted. The
verified credentials login (`POST /Users/AuthenticateByName`) and the
direct API-key flow remain.

Connect can be added in a follow-up once the endpoints are confirmed
against a Premiere-enabled, Connect-linked server.

---

## Database migration

`apps/server/src/database/migrations/1779021820174-AddEmbySupport.ts` was
generated via the documented TypeORM workflow (`yarn migration:generate`
against a database with all prior migrations applied - see
`typeorm_instructions.txt`).

It adds four nullable `varchar` columns to the `settings` table:

- `emby_url`
- `emby_api_key`
- `emby_user_id`
- `emby_server_name`

The migration uses TypeORM's standard SQLite temporary-table rename pattern
(SQLite can't easily `ALTER ADD COLUMN` with full schema preservation).
No data loss path; all four columns default to NULL and are only populated
when the user configures Emby.

---

## Logo + licensing

`apps/ui/public/icons_logos/emby.png` is a 377×377 crop of the leftmost
icon portion of the [Wikimedia Commons Emby-logo.png](https://commons.wikimedia.org/wiki/File:Emby-logo.png)
(original 1238×377). Licensed under **CC BY-SA 4.0** - the same license
as the existing `jellyfin.svg`. Attribution and license terms are recorded
in `apps/ui/public/icons_logos/emby.png.LICENSE.txt`.

The original wordmark was cropped because the UI selector and switch-preview
modal both render the logo into a 1:1 square slot; the wide wordmark was
getting squashed.

---

## CodeQL alerts (false positives)

CodeQL's `js/server-side-request-forgery` query flags the
`axios.create({baseURL: userUrl})` call in `emby-api.helper.ts`. These
alerts will be **dismissed in the GitHub Security UI as "Won't fix - by
design"**, not patched, for the following reason:

Maintainerr is a self-hosted application whose entire purpose is to talk
to the user's own media server. The user supplying the URL is the same
person running the Maintainerr instance - there is no untrusted
operator/attacker separation. The existing Plex and Jellyfin adapters have
the exact same data flow (user URL → HTTP request host); CodeQL doesn't
flag them only because the URL crosses an external SDK boundary
(`new PlexApi({hostname})`, `jellyfin.createApi(url, key)`) that the
analysis doesn't trace into. The Emby helper is in-repo so CodeQL sees
the full chain.

Hostname blocklists (rejecting `192.168.*` / `10.*` / `fc*` / `fe80:*`,
etc.) were **explicitly considered and rejected** - they would break the
documented LAN use case for what is a non-issue here. The maintainer's
own words: _"this is intended to be run locally so fixes like this seems
super messy and hacky"_.

---

## Testing scripts & how to verify locally

The PR description has the recommended quick-test path (replace `:latest`
with `:pr-2911` in your `docker-compose.yml` and restart). For full local
dev verification:

1. Install Emby Server. On a Codespace, the `.deb` install pattern works:
   ```bash
   curl -sSL -o emby.deb https://github.com/MediaBrowser/Emby.Releases/releases/download/4.9.3.0/emby-server-deb_4.9.3.0_amd64.deb
   sudo dpkg -i emby.deb
   apt-get -y install ffmpeg  # for scanning sample files
   sudo mkdir -p /var/lib/emby && sudo chown -R emby:emby /var/lib/emby
   sudo su -s /bin/bash emby -c "/opt/emby-server/bin/emby-server" &
   ```
2. Complete first-run wizard via the API (no UI interaction required):
   ```bash
   curl -X POST http://localhost:8096/Startup/User -H "Content-Type: application/json" \
     -d '{"Name":"maintainerrAdmin","Password":"maintainerr123"}'
   curl -X POST http://localhost:8096/Startup/Complete -H "Content-Type: application/json" -d '{}'
   ```
3. Authenticate to get an admin access token, then issue a long-lived API key:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:8096/Users/AuthenticateByName \
     -H 'X-Emby-Authorization: MediaBrowser Client="Setup", Device="Bootstrap", DeviceId="setup", Version="1.0.0"' \
     -H "Content-Type: application/json" \
     -d '{"Username":"maintainerrAdmin","Pw":"maintainerr123"}' | jq -r .AccessToken)
   curl -X POST "http://localhost:8096/Auth/Keys?App=Maintainerr" -H "X-Emby-Token: $TOKEN"
   APIKEY=$(curl -s http://localhost:8096/Auth/Keys -H "X-Emby-Token: $TOKEN" | jq -r '.Items[0].AccessToken')
   ```
4. Create a sample media library:
   ```bash
   sudo mkdir -p /opt/emby-media/movies /opt/emby-media/shows
   # Generate tiny real videos so Emby's scanner picks them up
   for f in "Sample Movie One (2024).mkv" "Sample Movie Two (2024).mkv"; do
     sudo bash -c "ffmpeg -y -f lavfi -i color=black:s=160x90:d=1 -c:v libx264 -t 1 '/opt/emby-media/movies/$f'"
   done
   sudo chown -R emby:emby /opt/emby-media
   curl -X POST "http://localhost:8096/Library/VirtualFolders?refreshLibrary=true&name=Movies&collectionType=movies&paths=%2Fopt%2Femby-media%2Fmovies" \
     -H "X-Emby-Token: $APIKEY"
   ```
5. `yarn dev` from the repo root and pick **Emby** in the media-server
   selector. Use the credentials login or paste the API key directly.

---

## Known gaps / future work

These are deferred deliberately and tracked in code via `TODO(emby-server-test):`:

- **Server-dependent test specs**: no `emby-adapter.service.spec.ts`,
  `emby-getter.service.spec.ts`, or `emby-overlay.provider.spec.ts`.
  Writing synthetic fixtures against unverified endpoints would just
  codify assumptions about Emby's actual HTTP response shapes. The
  in-process branching that does _not_ depend on Emby HTTP is covered -
  see [Tests landed in this PR](#tests-landed-in-this-pr). Add the
  server-dependent specs once the live endpoints have been confirmed
  and the actual response shapes are known.
- **Per-user fan-out batching**: `getDescendantEpisodeWatchers`,
  `getItemFavoritedBy`, `getTotalPlayCount` use a sequential `for` loop
  over users. `JellyfinAdapterService` uses `mapUsersBatched` with
  `Promise.allSettled` for rate-limited parallelism. Worth porting if
  performance becomes an issue on servers with many users.
- **Smart collection support**: Emby has no native smart collections
  (verified against Emby's official Collections docs and a 2018 forum
  thread where Luke/CEO said it was a planned feature; closed unimplemented
  in 2021). If Emby ever ships them, revisit `EmbyMapper.toMediaCollection`
  and `MEDIA_SERVER_FEATURES[EMBY]`.
- **Emby Connect**: see [above](#why-emby-connect-is-not-implemented).
  Needs Premiere-enabled test server to verify endpoints before shipping.
- **Overlay random-item helpers**: `EmbyOverlayProvider.getRandomItem` /
  `getRandomEpisode` / `downloadImage` are stubbed.
- **Comment "Jellyfin" residue**: two header references in
  `emby-getter.service.ts` deliberately name Jellyfin as the prior art
  the file mirrors. Not a bug, but worth a refresh if the two files
  diverge meaningfully.

---

## Bug history during the PR

Surfaced and fixed inside this PR:

1. **`testSetup()` missing EMBY case** (settings.service.ts) - caused 403
   on `/api/media-server/*` after a successful Emby save. Fixed by adding
   an EMBY branch alongside Plex and Jellyfin.
2. **`testMediaServerConnection()` missing EMBY case** - similar oversight,
   meant the connection re-verification helper would always return false
   for Emby.
3. **Prettier failures** on the initial commit - 9 files; resolved with
   `yarn format` plus replacement of `/\/+$/` regex with string ops (also
   eliminates the CodeQL ReDoS alert).
4. **Scope-creep refactors caught in self-review** -
   `settings.service.ts:autoDetect` had been rewritten as an array-loop
   when a simple `else if` would do; `factory.ts:resolveServerType` had
   been rewritten with a count-based check. Both reverted to the minimal
   additive shape matching the original Plex/Jellyfin pattern.

Surfaced by an external tester (Nomsplease on the beta-testers Discord channel):

5. **`sw_*` show-level rule properties returned `null`** - rules like
   `Emby - Amount of watched episodes equals 0` evaluated to null because
   `EmbyGetterService` only implemented 16 simple properties and fell
   through to a `default:` TODO for everything else. Fixed by:
   - Adding 5 new methods to `EmbyAdapterService`:
     `getChildrenMetadata(parentId, kind?)`, `getItemFavoritedBy`,
     `getTotalPlayCount`, `getDescendantEpisodeWatchers`, `getPlaylistItems`.
   - Replacing `EmbyGetterService` with a full 1007-line port of
     `JellyfinGetterService` (all 50+ case branches + every private helper,
     same caching semantics, same `Application.EMBY` dispatch).

Caught while reviewing my own comments:

6. **False claim that Emby Premiere supports smart collections** - verified
   against [Emby's Collections docs](https://emby.media/support/articles/Collections.html)
   and a [closed-as-duplicate 2018 feature request](https://emby.media/community/index.php?/topic/58063-emby-server-option-to-auto-add-to-collections-based-on-pathattribute-matching-rules/).
   Emby has manual BoxSets and TheMovieDb-driven "Automatic Creation of
   Collections" (franchise grouping, not filter rules). No native smart
   collections. Comments in `emby.mapper.ts` and `emby-getter.service.ts`
   corrected.
7. **False claim that Emby retained pre-fork boxset Move endpoints** -
   verified against an [Emby forum thread](https://emby.media/community/topic/124081-set-display-order-of-a-collection-with-api/)
   where Luke (Emby CEO) confirmed the API exposes `DisplayOrder =
PremiereDate | SortName` only; no item-move/reorder endpoint exists.
   `EmbyAdapterService.reorderCollectionItems` was rewritten to simply
   throw "not supported"; the COLLECTION_SORT comment in
   `features.ts` was corrected to explain why.

---

## Commit log

All commits on the `emby-support` branch after the initial feature commit
landed (most recent first):

```
3b64701b fix(emby): correct two false claims about Emby's collection support
6b870fc4 style(emby-getter): replace stale Jellyfin attributions with Emby ones
674da0df feat(emby): port full JellyfinGetterService to EmbyGetterService
5f1e6db0 style: yarn format
24ef20b4 Refactor isEmby assignment for readability
12608e54 style(rule-executor): break boxset-workaround ternary across lines for readability
9f32bc6a refactor(emby): move HTTP client construction into emby-api/
0459f85e refactor(rule-executor): separate isJellyfin/isEmby flags
bb02133f style(emby): apply prettier and use string-ops trailing-slash trim
169b2009 Merge branch 'development' into emby-support
f63d2b63 feat(media-server): add Emby as a third supported media server
```

---

## File inventory

### New files

```
apps/server/src/database/migrations/1779021820174-AddEmbySupport.ts
apps/server/src/modules/api/emby-api/emby-api.helper.ts
apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts
apps/server/src/modules/api/media-server/emby/emby.constants.ts
apps/server/src/modules/api/media-server/emby/emby.mapper.ts
apps/server/src/modules/api/media-server/emby/emby.mapper.spec.ts
apps/server/src/modules/api/media-server/emby/emby.module.ts
apps/server/src/modules/api/media-server/emby/emby.types.ts
apps/server/src/modules/api/media-server/emby/index.ts
apps/server/src/modules/overlays/providers/emby-overlay.provider.ts
apps/server/src/modules/rules/getter/emby-getter.service.ts
apps/server/src/modules/rules/rules.service.cacheReset.spec.ts
apps/ui/public/icons_logos/emby.png
apps/ui/public/icons_logos/emby.png.LICENSE.txt
apps/ui/src/components/Login/Emby/EmbyLoginButton.tsx
apps/ui/src/components/Settings/Emby/index.tsx
packages/contracts/src/media-server/emby/embySetting.ts
packages/contracts/src/media-server/emby/index.ts
```

### Modified files

See the "Cross-cutting touchpoints" table in
[Architecture & layering](#architecture--layering) above for the full list
with per-file rationale.

---

## Pointer for future contributors

The single highest-value follow-up is **running the PR Docker image against
a real Emby server** (both free tier and Premiere). The verified surface is
narrow; the scaffolded surface is wide. When a tester reports a bug:

1. Reproduce against the same Emby version
2. Open the matching `TODO(emby-server-test):` site in the adapter or getter
3. Hit the endpoint directly with `curl` against the Emby server to see the
   real response shape
4. Fix the call site, run `yarn test`, push

The Jellyfin adapter and getter are the closest reference for "what
correct looks like" given the shared backend lineage - but never assume
parity. Verify, then code.
