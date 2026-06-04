# Emby Support — Follow-up Fixes

Consolidated punch list for `emby-support` branch / PR #2911.

Sources for each item:
- **Tester** — production failure reported by Nomsplease in HOPS Discord
- **Review** — GitHub Copilot agent PR review
- **RE** — reverse engineering against a live Emby 4.9.3.0 install (decompiled `Emby.Api.dll` + the server's own `/openapi` spec)

References that anchor every claim in this document:
- `/openapi` and `/swagger` on a running Emby server return a 2.5 MB OpenAPI 2.0 spec titled *"Emby Server REST API 4.9.3.0"* — 422 endpoints.
- `Emby.Api.dll` decompiled with `ilspycmd` (10,087 lines, 343 `[Route]` attributes) is the source-of-truth handler code.
- `Emby.Server.Implementations.dll` decompiled (72,570 lines) contains the auth header parser at lines 53494-53557.

## Status legend

| Tier | Meaning |
|---|---|
| HIGH | Must fix before merge. Each is a reproducible bug that can corrupt user data or silently misbehave. |
| MEDIUM | Should fix before merge. Documented behaviour does not match implementation. |
| LOW | Nice to fix. Style, copy, or docs inconsistencies. |
| OPTIONAL | Considered improvements that need a decision, not a bug. |

---

## HIGH — must fix before merge

### H1. Auto-create flow produces 500 against real Emby — confirmed by tester

**Source**: Tester
**Files**: [emby-adapter.service.ts:765-803](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L765-L803), the upstream call site in `CollectionsService` (Maintainerr's shared `addToCollectionInternal`).

**Symptom (from the tester log)**:
```
INFO  Adding 76 media items to 'Delete Watched TV Shows by Season'
DEBUG [checkAutomaticMediaServerLink] No media server collection — will be created automatically when items match
ERROR Failed to create Jellyfin collection
      Request failed with status code 500 (ERR_BAD_RESPONSE)
```

The tester is on the pre-PR Jellyfin-against-Emby workaround, but the failure mode applies to our adapter too because Maintainerr's shared auto-create flow calls `mediaServer.createCollection(...)` with `Name`, `ParentId`, **no initial items**, then immediately follows with `addToCollection`. Emby's `POST /Collections` accepts an `Ids` query param at create time per the OpenAPI spec and the decompiled `CreateCollection` DTO at `Emby.Api:7535-7548`, and the real-world behaviour observed against an Emby 4.9.3.0 box is that creating an empty box-set first and adding items later is the path that fails.

**Fix options** (must verify against the live local Emby before picking):

A. **Pass initial items at create time when known** — change `createCollection` to forward the first batch of `Ids` as a query param on `POST /Collections`. Add a regression test that asserts the request shape via a mocked HTTP layer, plus a smoke test that runs against the local Emby Server to confirm the response is 200 and the items land.

B. **Capability-aware fallback** — keep the abstraction (create empty, then add) and have the Emby adapter internally buffer the first add call so that, when called immediately after a create, it issues a single combined create-with-items. Less invasive at the call site, more state in the adapter.

Recommendation: A. The Maintainerr abstraction does not promise "empty create" semantics — it promises "this collection ends up with these items". The Emby adapter is allowed to issue whichever wire calls accomplish that.

**Verification**:
1. Reproduce the 500 against the local Emby in this Codespace by hand-curling `POST /Collections?Name=Foo&ParentId=<libraryId>` with no `Ids`. Capture the exact response body.
2. Confirm `POST /Collections?Name=Foo&ParentId=<libraryId>&Ids=<one-real-item-id>` returns 200.
3. Add a Jest spec asserting the create call shape.
4. Once landed, run the tester's rule against the pr-2911 image and confirm collection creation succeeds end-to-end.

---

### H2. Show-context episode resolution returns empty on Emby

**Source**: Review
**Files**: [emby-adapter.service.ts:1054-1063](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L1054-L1063), with the adapter's own contradicting comment at [emby-adapter.service.ts:428-431](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L428-L431).

**Current code**:
```ts
if (collectionType === 'episode' && context.type === 'show') {
  const children = await this.getChildrenMetadata(context.id);  // ← no childType
  // Children of a series are seasons; need to descend further for episodes.
  ...
}
```

`getChildrenMetadata(parentId)` with no `childType` falls through to `GET /Items?ParentId=<parentId>`, which the same adapter explicitly documents as broken for seasons:

> Seasons of a series live under `/Shows/{seriesId}/Seasons`, not under `/Items?ParentId=` (ParentId of a season points to the library folder, not the show).

So the children list is empty on Emby, and the function returns `[]` instead of the show's episode IDs.

**Fix**: pass the `'season'` filter so the path routes through `/Shows/{Id}/Seasons`:

```ts
const seasons = await this.getChildrenMetadata(context.id, 'season');
const episodeIds: string[] = [];
for (const season of seasons) {
  const eps = await this.getChildrenMetadata(season.id, 'episode');
  episodeIds.push(...eps.map((e) => e.id));
}
```

**Verification**: add a unit test for `getAllIdsForContextAction(collectionType='episode', context={type:'show', id})` that asserts the season route is queried.

---

### H3. `cleanupCollectionForLibrary` filter is always empty on Emby — collection switching leaks items

**Source**: Review
**Files**: [emby-adapter.service.ts:820-839](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L820-L839), data shape set by [emby.mapper.ts:150-152](../apps/server/src/modules/api/media-server/emby/emby.mapper.ts#L150-L152).

**Current code**:
```ts
const children = await this.getCollectionChildren(collectionId);
const fromLibrary = children.filter((c) => c.library?.id === libraryId);
```

The mapper builds each `MediaItem.library.id` from the item's `ParentId`. For items returned by `/Items?ParentId=<collectionId>`, `ParentId` is **the collection itself**, not the source library. The filter is therefore always empty, so library-scoped cleanup never removes anything. Switching a rule group's library leaves stale items behind in shared collections.

**Fix**: mirror the Jellyfin pattern at [jellyfin-adapter.service.ts:720-739, 1640-1665](../apps/server/src/modules/api/media-server/jellyfin/jellyfin-adapter.service.ts#L1640-L1665) — query Emby for each item's actual ancestors (the equivalent on Emby is `GET /Items/{id}/Ancestors` or `GET /Users/{userId}/Items/{id}` with the `Path`/`ParentId` chain) and check membership against `libraryId`. Encapsulate in a private `itemIsInLibrary(itemId, libraryId)` helper to match Jellyfin.

**Verification**: spec the helper directly with mocked ancestor responses, plus an integration test that exercises the rule-group switch path end-to-end against the local Emby.

---

### H4. `getWatchHistory` collapses transient failures into "never watched" — can drive wrong removals

**Source**: Review
**Files**: [emby-adapter.service.ts:670-700](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L670-L700).

**Current code**:
```ts
try {
  const users = await this.getUsers();
  ...
} catch (error) {
  this.logger.debug(`Emby getWatchHistory(${itemId}) failed: ...`);
  return [];          // ← any auth, 5xx, or network error becomes "never watched"
}
```

The reference Jellyfin implementation explicitly documents why this is wrong, at [jellyfin-adapter.service.ts:1040-1043](../apps/server/src/modules/api/media-server/jellyfin/jellyfin-adapter.service.ts#L1040-L1043):

> Errors must propagate so callers can distinguish a real outage from a confirmed empty history. Returning `[]` here would misclassify failures as "never watched", which leaks into NOT_EXISTS checks and missing-value diagnostics in the rules layer.

A rule that removes "watched media older than 30 days" would, during an Emby outage, evaluate every item as never watched and *delete nothing*. A rule that removes "never-watched media older than 30 days" would, during the same outage, evaluate every item as never watched and *delete everything*. The second is the dangerous case — and it's exactly the kind of rule community libraries use.

**Fix**: rethrow on the outer failure. Keep the inner per-user `try { ... } catch { /* skip */ }` — that pattern is correct because individual users may legitimately lack access to an item.

```ts
async getWatchHistory(itemId: string): Promise<WatchRecord[]> {
  if (!this.http) return [];
  const users = await this.getUsers();        // ← let failures propagate
  const records: WatchRecord[] = [];
  for (const user of users) {
    try { ... } catch { /* per-user visibility miss */ }
  }
  return records;
}
```

**Verification**: spec covering (a) one user can't see item → record skipped, others still included; (b) `getUsers()` throws → `getWatchHistory` throws.

---

### H5. Overlay `itemExists` can permanently delete the original poster backup — RESOLVED

**Source**: Review

`EmbyAdapterService.itemExists` is now a dedicated probe that returns `false` only on a confirmed 404 and rethrows on any other status / network error (matching the Jellyfin adapter), so a transient Emby outage can no longer be read as "item deleted." `itemExists` has since been promoted to the shared `IMediaServerService` interface and is the single source of truth; the overlay processor calls it through `MediaServerFactory.getService()` (the overlay provider no longer carries its own `itemExists`). The existence check is wrapped so any throw leaves the item optimistically "present" and the backup is preserved for retry. Covered by adapter specs (200 → true, 404 → false, 5xx/network → throws) and the overlay-processor revert specs.

---

## MEDIUM — should fix before merge

### M1. `sortTitle` is silently dropped on create and update

**Source**: Review
**Files**: [emby-adapter.service.ts:780-795](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L780-L795) and [emby-adapter.service.ts:925-940](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L925-L940).

**Current `createCollection`**:
```ts
if (params.summary) {                 // ← gated on summary only
  await this.updateCollection({ ..., sortTitle: params.sortTitle });
}
```

If a caller passes `sortTitle` but no `summary`, the follow-up never runs.

**Current `updateCollection`**:
```ts
const updated = {
  ...current,
  Name: params.title ?? current.Name,
  Overview: params.summary ?? current.Overview,
  // ← no ForcedSortName / SortName field, ever
};
```

`sortTitle` is in `CreateCollectionParams` / `UpdateCollectionParams` but the Emby adapter never writes it anywhere.

**Fix**:
1. In `createCollection`, run the follow-up when either `summary` **or** `sortTitle` is set.
2. In `updateCollection`, set Emby's sort field (likely `ForcedSortName` based on the BaseItemDto schema in the swagger spec, confirm against the live API) when `params.sortTitle` is present.

**Verification**: unit test create+update with `{sortTitle: 'foo'}` and assert the body sent on the update POST contains the sort field.

---

## LOW — nice to fix before merge

### L1. Stale auth header comment claims things that aren't true

**Source**: RE
**Files**: [emby-adapter.service.ts:53](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L53), with the matching `buildAuthHeader` at [emby-adapter.service.ts:1197-1199](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L1197-L1199).

**Current comment**:
> X-MediaBrowser-Authorization header requires Version="1.0.0" (pinned).

Both claims are false, verified against the decompiled parser at `Emby.Server.Implementations:53494-53557`:

- The header name we actually send is `X-Emby-Authorization` (also `Authorization` is accepted). `X-MediaBrowser-Authorization` is not the name we use anywhere.
- There is no `Version` validation in Emby's parser. A live curl with `Version="999.999.999"` returns the same 401 as `Version="1.0.0"` — the parser stores the version on session info but never compares it to a required value. `grep -r '"1\.0\.0"'` across the entire decompiled `Emby.Api.dll` and `Emby.Server.Implementations.dll` returns zero matches.

**Fix**: replace the comment with a one-liner that accurately describes what we send:

```ts
// X-Emby-Authorization header. Emby's parser accepts either `Emby` or
// `MediaBrowser` as the scheme prefix and stores Version on session info
// without enforcement.
```

No code change.

---

### L2. `GET /Users` is a hidden endpoint — switch to `/Users/Query`

**Source**: RE
**File**: [emby-adapter.service.ts:186](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L186)

`GET /Users` exists in the decompiled route table at `Emby.Api:2752` but is marked `IsHidden = true` and does not appear in the published `/openapi` spec. The Emby dashboard JS uses `/Users/Query` instead. Works today, but is fragile against upstream changes.

**Fix**: switch `/Users` → `/Users/Query`. Same response shape, public API. One line.

---

### L3. `userId` query param uses wrong casing

**Source**: RE
**File**: [emby-adapter.service.ts:574](../apps/server/src/modules/api/media-server/emby/emby-adapter.service.ts#L574)

Emby's query parsing is case-insensitive (`StringComparer.OrdinalIgnoreCase`), so it works, but the documented param name in both the OpenAPI spec and the `[ApiMember]` attribute is `UserId` (PascalCase). The rest of our adapter uses PascalCase. Inconsistent.

**Fix**: `userId: this.embyUserId` → `UserId: this.embyUserId`.

---

### L4. Emby login controller bypasses Zod validation

**Source**: Review
**File**: [settings.controller.ts:441-450](../apps/server/src/modules/settings/settings.controller.ts#L441-L450)

The new `POST /api/settings/emby/login` accepts raw `@Body() payload: { emby_url, username, password }` instead of using a shared schema and `ZodValidationPipe`, unlike the surrounding settings endpoints.

**Fix**:
1. Define `embyLoginRequestSchema` in `packages/contracts/src/media-server/emby/` (new file or extend `embySetting.ts`):
   ```ts
   export const embyLoginRequestSchema = z.object({
     emby_url: serviceUrlSchema,
     username: z.string().trim().min(1),
     password: z.string(),
   });
   export type EmbyLoginRequest = z.infer<typeof embyLoginRequestSchema>;
   ```
2. Export from the contracts barrel.
3. In the controller: `@Body(new ZodValidationPipe(embyLoginRequestSchema)) payload: EmbyLoginRequest`.

---

### L5. Onboarding copy still says "Choose Plex or Jellyfin"

**Source**: Review
**Files**: [Settings/index.tsx:277-278](../apps/ui/src/components/Settings/index.tsx#L277-L278), pinned by [Settings.spec.tsx:224](../apps/ui/src/components/Settings/Settings.spec.tsx#L224).

The first-time-user welcome screen still tells users to "Choose Plex or Jellyfin", which is no longer true.

**Fix**: change the copy to either mention Emby explicitly or be server-agnostic ("Choose your media server"). Update the test assertion to match.

---

### L6. Broken verification script in `docs/emby-support.md`

**Source**: Review
**File**: [emby-support.md:378-395](emby-support.md#L378-L395)

The script prints the generated API key but never assigns it to `$APIKEY`, then the next step uses `$APIKEY`.

**Fix**: assign the key to `APIKEY` on the same line that prints it, or reuse `$TOKEN` consistently throughout the section.

---

## OPTIONAL — improvements to consider (not bugs)

### O1. Set `IsLocked: true` on `createCollection`

The Jellyfin adapter sets `isLocked: true` on collection creation with the comment *"enables composite image generation from collection items"*. Without it, Emby may not auto-generate the composite cover image when items are added. Worth a quick A/B against the local Emby — if the composite cover behaviour matches Jellyfin, set the flag. Independent of H1, but the changes can land together.

### O2. Wire `POST /Playlists/{Id}/Items/{ItemId}/Move/{NewIndex}` for playlist reorder

Confirmed implementable against a live Emby — but deliberately deferred because the call site doesn't exist in Maintainerr.

**What the source dig confirmed**:
- The route is real (`Emby.Api:1841`) and the handler at `Emby.Api:1909-1919` delegates straight to `IPlaylistManager.MoveItem(playlist, request.ItemId, request.NewIndex)`.
- The DTO declares `ItemId` as `long`, but the official Emby web client at `dashboard-ui/modules/emby-apiclient/apiclient.js` passes `items[i].PlaylistItemId` — a `string` field on `BaseItemDto` (`Emby.Api:6488`) returned by `GET /Playlists/{Id}/Items`. ServiceStack handles the string-to-long conversion at the path-binding layer. No client-side internal-ID mapping needed.

**Why we still defer**:
- `IMediaServerService` only declares `reorderCollectionItems` ([media-server.interface.ts:280](../apps/server/src/modules/api/media-server/media-server.interface.ts#L280)).
- The sole call site for that method is the Plex `COLLECTION_SORT` path at [collections.service.ts:849](../apps/server/src/modules/collections/collections.service.ts#L849).
- No `reorderPlaylistItems` method exists, no Maintainerr rule action generates one, and no UI flow asks for it.

Shipping the Emby impl would mean adding an interface method, three adapter implementations (Plex/Jellyfin/Emby), and a feature flag — all unreachable from any user flow. File as a follow-up issue if a real use case appears.

Collection reorder remains genuinely unavailable on Emby (no equivalent `/Collections/{Id}/Items/{ItemId}/Move` route in either the swagger spec or the decompiled handler set). The current `COLLECTION_SORT = false` capability is correct.

### O3. Live-server integration test harness

The PR doc states up front that a wide Emby HTTP surface is scaffolded but unverified. Once H1-H5 land, add a small set of integration tests that run against a real Emby (e.g. via the same Codespace flow used to find these bugs) and cover at least the create-with-items, library-membership cleanup, watch-history, and overlay flows end-to-end.

---

## Dismissed — not a finding

### D1. `release_pr.yml` removed the `environment: release-builds` gate

**Source**: Review (false positive)

This change is present in the cumulative diff against `development` but **is not from this PR**. It came in via the upstream merge commit `5d6f8ff4` ("Revert PR 2879 (#2904)"), which reverted the PR that originally added the gate. Our `emby-support` branch absorbed the revert when it merged `development`.

`git log development..emby-support -- .github/workflows/release_pr.yml` returns only the merge commit, confirming we made no direct edits to the workflow.

No action on this PR. If the gate should be re-added, that is a separate conversation about the reverted PR #2879's design.

---

## Suggested execution order

1. **H1, H2, H3, H4** — wire bugs that produce wrong data. Land each as its own commit with a focused regression test.
2. **H5** — overlay safety. Land with its own spec.
3. **M1** — sortTitle plumbing.
4. **L1, L2, L3, L4, L5, L6** — batch as a single "review nits" commit (small, low-risk).
5. **O1** — verify against local Emby, land in the same commit if it works as expected.
6. **O2, O3** — defer to follow-up issues.

After step 1-3 land, re-test the full Emby flow end-to-end against the local Codespace Emby AND request that Nomsplease re-runs his rule against the next pr-2911 image build.

## Cross-reference

The 28 endpoints our adapter calls were verified against the running Emby 4.9.3.0's own `/openapi` (422-path spec). All resolve. Two are sub-optimal:
- `GET /Users` → use `/Users/Query` (L2)
- `userId` query param → use `UserId` (L3)

No other parameter shapes or paths are wrong. The implementation gaps above are about behaviour and error handling, not endpoint discovery.
