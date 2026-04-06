# Fix Report — Tester Feedback Follow-Up (April 6, 2026)

This report records the code changes made from the April 5–6 tester feedback documents, the concrete reason for each fix, and the validation that was completed.

## Sorted Issues

### BUG-1 / SUGGESTION-1: Media server setup gating and Logs access

**What changed**

- The UI setup check now mirrors the server-side `SettingsService.testSetup()` criteria instead of only checking whether `media_server_type` exists.
- `apps/ui/src/hooks/useMediaServerType.ts` now derives:
  - media server type selected
  - setup complete
  - setup incomplete
- `apps/ui/src/components/Layout/MediaServerSetupGuard.tsx` and `apps/ui/src/components/Settings/index.tsx` now gate on setup completeness, not just type selection.
- `/settings/logs` is now allowed during setup.

**Why**

The original UI guard unlocked the app as soon as the user picked Plex or Jellyfin, which was weaker than the server’s actual setup-complete rules.

**Outcome**

- Selecting a media server no longer unlocks Overview, Rules, and Collections by itself.
- Logs stays reachable during setup for troubleshooting.

### BUG-2: Database backup success feedback

**What changed**

- `apps/ui/src/components/Settings/Main/DatabaseBackupModal.tsx` now reports success back to the Main settings page before closing.
- `apps/ui/src/components/Settings/Main/index.tsx` routes that through `useSettingsFeedback()` and shows `Database backup downloaded` in the shared inline feedback slot.

**Why**

The modal used to close immediately after a successful download, so the user got no confirmation that anything happened.

**Outcome**

- Backup success is visible inline using the existing settings feedback pattern.
- Failed backups still stay in the modal and show an inline error there.

### BUG-3: Plex 400 batch-add diagnostics

**What changed**

- `apps/server/src/modules/api/plex-api/plex-api.service.ts` now classifies Plex collection mutation HTTP failures by actual response status.
- HTTP 4xx request failures now return request-specific messages such as `Plex request failed with 400 Bad Request...` instead of the old connectivity-only wording.
- `apps/server/src/modules/api/media-server/plex/plex-adapter.service.ts` now logs chunk number, chunk size, chunk start index, and item ids before falling back to per-item adds.

**Why**

The previous message `Plex api communication failure.. Is the application running?` was misleading for request-shape failures like HTTP 400.

**Outcome**

- Operators can distinguish request failures from network failures.
- Batch fallback behavior is unchanged, but it is now diagnosable.

**Deliberate non-change**

- Batch size and throttling were not changed because the tester report alone did not establish the 400 root cause.

### BUG-4: Stale child count after item removal

**What changed**

- `apps/server/src/modules/collections/collections.service.ts` now trusts Plex collection metadata `childCount` as the primary source when deciding whether an automatic collection is empty.
- Child enumeration is only used as a fallback if the metadata count is unavailable.

**Why**

The tester log showed Plex metadata already had the correct count while `getCollectionChildren()` was still stale immediately after removals.

**Outcome**

- Automatic Plex collection cleanup now uses the cheaper and more reliable source of truth for this path.

### BUG-5: False failure notifications

**What changed**

- `apps/server/src/modules/rules/tasks/rule-executor.service.ts` now emits `RuleHandler_Failed` from one top-level decision point only.
- Inner helper failures now throw `RuleExecutionFailure`, which the outer executor translates into a single failure outcome.
- `apps/server/src/modules/collections/collection-worker.service.ts` now tracks a single run-level failure state and emits `CollectionHandler_Failed` once, in one place.
- Collection handler precheck failure no longer emits `CollectionHandler_Finished` twice.
- Finished events still fire so UI lifecycle state remains consistent, but their message now distinguishes error completion.

**Why**

The previous rule executor could emit failure from inner paths and still continue to an apparently successful finish.

**Outcome**

- Successful rule runs no longer emit failure notifications from inner helper paths.
- Collection handler failure emission is now centralized and easier to reason about.

### BUG-6: Collections silently disappearing from handler logs

**What changed**

- `apps/server/src/modules/collections/collection-worker.service.ts` now logs `Skipping collection 'X' because no media is due for handling` for active collections that have nothing due.
- The worker also logs a concise per-run summary with:
  - total active collections
  - skipped because `Do Nothing`
  - skipped because no due media
  - queued for handling

**Why**

Previously, active collections with zero due media were silently filtered out, which made the tester report ambiguous.

**Outcome**

- “Missing” collections in logs are now explainable without guessing whether they were filtered out incorrectly.

### BUG-7: Log stream connection error noise

**What changed**

- `apps/ui/src/components/Settings/Logs/index.tsx` now delays client error reporting for the logs stream by 5 seconds and suppresses reporting during intentional cleanup.
- `apps/server/src/modules/logging/logs.controller.ts` now records `Settings.Logs.stream` client reports at debug level instead of error level.

**Why**

A transient disconnect or page navigation should not generate a server-side error entry that looks like a backend defect.

**Outcome**

- Short-lived or navigation-driven disconnects no longer create noisy server error entries.
- Persistent stream failures still report.

## Validation

### Focused UI tests

- `apps/ui/src/components/Layout/MediaServerSetupGuard.spec.tsx`
- `apps/ui/src/components/Settings/Main/DatabaseBackupModal.spec.tsx`

Result: passing

### Focused server tests

- `apps/server/src/modules/rules/tasks/rule-executor.service.spec.ts`
- `apps/server/src/modules/collections/collection-worker.server.spec.ts`
- `apps/server/src/modules/api/plex-api/plex-api.service.spec.ts`
- `apps/server/src/modules/collections/collections.service.spec.ts`

Result: passing

## Clarified Manual QA Guidance

The tester gaps from the original report were not left as assumptions. These are the clarified manual checks to use going forward:

1. Plex PIN timeout: start Plex auth, do not complete login, wait 5 minutes, then verify the spinner stops and a timeout message appears.
2. Per-install client ID: inspect Maintainerr server logs after first OAuth and verify `clientId` is a unique UUID, not a hardcoded shared identifier.
3. Artwork fallback: create a collection with matching rule results and verify poster artwork is present even if the primary metadata source lacks artwork.
4. Library-scoped rule targeting: create a rule for Library A and verify Library B items do not match.
5. Stale items / trailing pages: delete an item directly in Plex, then open the Maintainerr collection and verify page totals do not include the deleted item.
6. Maintainerr Status: create at least one actionable rule before validating status badges, modal details, and Overview sorting.

## Notes

- No Plex batch-size or throttle change was made because the current evidence supported better classification and diagnostics, not a throughput conclusion.
- The collection failure-notification report from the tester did not have a reproducible success-path emission in current source. The code was still tightened so failure emission is now explicit and centralized instead of split across inner paths.