# Developer Action Items — Tester Feedback (April 5–6)

Baseline: `development` @ `520dce4b`

---

## Bugs

### BUG-1: Nav items unlock before media server setup is complete (❌ critical)

**Reported:** Clicking Plex in the Media Server selector saves `media_server_type`, which immediately
unlocks all nav items (Overview, Rules, Collections) — even before the Plex OAuth flow is finished.

**Root cause:** `isNotConfigured` in `useMediaServerType` (`apps/ui/src/hooks/useMediaServerType.ts:22`)
only checks `!mediaServerType`. As soon as the type is persisted (user clicks Plex/Jellyfin), the guard
passes — regardless of whether a server URL, token, or successful connection test exists.

**Fix direction:** The setup guard in `apps/ui/src/components/Layout/MediaServerSetupGuard.tsx` (and
the `isAllowedDuringMediaServerSetup` whitelist) needs a stricter check. Consider gating on
`media_server_type` AND a valid connection (e.g., `plex_hostname` is set and token exists), not just
the type selection.

**Files to check:**
- `apps/ui/src/hooks/useMediaServerType.ts`
- `apps/ui/src/components/Layout/MediaServerSetupGuard.tsx`
- `apps/ui/src/components/Settings/index.tsx` (lines 214–219)

---

### BUG-2: No inline feedback after database backup (❌)

**Reported:** Settings > Main > Create Database Backup completes silently — modal just closes.

**Root cause:** `apps/ui/src/components/Settings/Main/DatabaseBackupModal.tsx:40` calls `onClose()`
immediately after a successful download with no success feedback.

**Fix direction:** Show a brief inline success message (e.g., Alert with `type="success"`) before
closing, or keep the modal open momentarily with a success state. Alternatively, show a toast after
close — but inline feedback is the pattern used elsewhere in settings.

---

### BUG-3: Plex 400 errors during large batch add (~600 items)

**Reported:** Adding 600 items to a Plex collection produced multiple `400` errors:
```
PUT http://192...100:32400/li...226 failed — response code: 400
```
The fallback per-item retry in `addBatchToCollection`
(`apps/server/src/modules/api/media-server/plex/plex-adapter.service.ts:382–422`) eventually
completed, but the errors are noisy and slow.

**Current batch size:** `PLEX_BATCH_SIZE.COLLECTION_MUTATION = 8`
(`apps/server/src/modules/api/media-server/plex/plex.constants.ts:7`)

**Investigation needed:**
- Are the 400s caused by Plex rejecting oversized `machineIdentifier` payloads, duplicate items, or
  rate limiting?
- Should there be a small delay between batches (throttle)?
- Should failed items be logged at WARN level with the Plex response body instead of triggering the
  generic "Is the application running?" error message?
- The error message `Plex api communication failure.. Is the application running?` is misleading for
  a 400 — that message should be reserved for network-level failures (timeouts, ECONNREFUSED), not
  HTTP 4xx responses.

---

### BUG-4: Stale child count after item removal

**Reported:** After removing 288 items, logs show:
```
getCollection(34300) returned: id=34300, childCount=311    ← correct
Collection 34300 has 599 children, keeping it              ← stale
```

**Root cause:** In `apps/server/src/modules/collections/collections.service.ts:1181–1182`,
`getCollectionChildren()` returns 599 items even though `getCollection()` reports `childCount=311`.
Plex likely hasn't finished processing the removals when the child list is fetched. The
`checkAutomaticMediaServerLink` method runs immediately after rule execution completes.

**Fix direction:**
- Consider using `serverColl.childCount` (from the collection metadata) instead of fetching and
  counting all children — it's cheaper and reflects Plex's own bookkeeping.
- Alternatively, add a brief delay before the check, or skip the empty-collection cleanup on the
  same execution cycle that performed removals.

---

### BUG-5: False positive failure notifications (❌ critical — Jellyfin)

**Reported:** Tester received two failure notification emails despite all operations completing
successfully:
- **08:00** — "[Maintainerr] - Rule Handling Failed" — but the log shows all 4 rules (`Filmer`,
  `Serier SEASON`, `Barnfilmer`, `TEST 3.3.0`) executed and completed without errors
- **12:00** — "[Maintainerr] - Collection Handling Failed" — but the log shows
  "All collections handled. No data was altered"

**Evidence from `debug.log`:**

At 08:00 (rule execution — all successful):
```
08:00:00  Starting execution of rule 'Filmer'
08:00:24  Execution of rules for 'Filmer' done.
08:00:25  Starting execution of rule 'Serier SEASON'
08:00:53  Execution of rules for 'Serier SEASON' done.
08:00:53  Starting execution of rule 'Barnfilmer'
08:01:00  Execution of rules for 'Barnfilmer' done.
08:01:00  Starting execution of rule 'TEST 3.3.0'
08:01:28  Execution of rules for 'TEST 3.3.0' done.
```
No ERROR lines. One WARN about "Genius" metadata mismatch (not a failure).

At 12:00 (collection handling — completed):
```
12:00:00  Started handling of all collections
12:00:00  Skipping collection 'Barnfilmer' as its action is 'Do Nothing'
12:00:00  Skipping collection 'TEST 3.3.0' as its action is 'Do Nothing'
12:00:00  All collections handled. No data was altered
```

**Investigation needed:**
- The notification service is sending "failed" emails when operations succeed. Check the notification
  trigger conditions in the rule executor and collection worker services
- Is the failure notification keyed off an exception that's caught and handled (so execution
  continues), but the notification still fires?
- Check if a WARN-level log (e.g., the "Rejected direct provider IDs" warning) is being
  misinterpreted as a failure

**Files to check:**
- `apps/server/src/modules/rules/tasks/rule-executor.service.ts` — look for notification dispatch
  after rule execution
- `apps/server/src/modules/collections/collections.service.ts` — collection handling completion
  trigger
- `apps/server/src/modules/notifications/notifications.service.ts` — failure notification conditions

---

### BUG-6: Collections silently disappear from handler (Jellyfin)

**Reported:** At 12:00, the collection handler skips `Filmer` and `Serier SEASON` entirely — they
appear in neither the "Handling" nor the "Skipping" log lines. Earlier runs (00:00, 02:55) processed
them normally.

**Evidence from `debug.log`:**

At 00:00 (normal):
```
Handling collection 'Filmer'
Handling collection 'Filmer' finished
Handling collection 'Serier SEASON'
Handling collection 'Serier SEASON' finished
```

At 12:00 (missing):
```
Skipping collection 'Barnfilmer' as its action is 'Do Nothing'
Skipping collection 'TEST 3.3.0' as its action is 'Do Nothing'
All collections handled. No data was altered
```

`Filmer` and `Serier SEASON` are not listed at all. The 08:00 rule execution still processed them
fine, so they exist in the DB. This could also be related to BUG-5 (the false failure notification
at 12:00).

**Investigation needed:**
- Is the collection handler query filtering them out due to a state change?
- Could the collection handler be throwing before reaching them, triggering the failure notification,
  but the error isn't logged?

---

### BUG-7: Log stream connection error

**Reported:** At 12:16:53 in `debug.log`:
```
[ERROR] [LogsController] Log stream connection failed
Settings.Logs.stream
```

This suggests the SSE log streaming endpoint disconnects unexpectedly. Could be triggered by the
tester navigating away from the Logs page, or by a timeout. Low severity but worth checking if
clients are not cleaning up their SSE connections properly.

**Files to check:**
- `apps/server/src/modules/logs/logs.controller.ts` — SSE stream endpoint error handling

---

## Suggestions from Tester

### SUGGESTION-1: Allow Logs tab during media server setup

**Reported:** Tester cannot access Logs before media server is configured. This blocks
troubleshooting when setup itself has issues.

**Fix:** Add `/settings/logs` to the whitelist in
`apps/ui/src/components/Layout/MediaServerSetupGuard.tsx:16`:
```ts
export const isAllowedDuringMediaServerSetup = (pathname: string) => {
  return (
    pathname === '/settings' ||
    pathname.startsWith('/settings/main') ||
    pathname.startsWith('/settings/logs')
  )
}
```
Also update the `routeIsDisabled` check in `apps/ui/src/components/Settings/index.tsx:214–219` to
match.

---

## Test Plan Gaps (items unclear to tester)

These test cases from the original plan were marked ❓ because the tester didn't know what to look
for. They need either better documentation in the test plan or a decision on whether automated tests
cover them sufficiently.

| Test ID | Issue | Recommendation |
|---------|-------|----------------|
| 2.2 — PIN timeout | Tester unsure how to trigger 5-min timeout | Add instruction: "Start Plex auth, do NOT complete login, wait 5 minutes — spinner should stop and show a timeout message" |
| 2.5 — Per-install client ID | Tester looked in Plex dashboard, not server logs | Add instruction: "Check Maintainerr server logs for `clientId` after first OAuth — it should be a unique UUID, not a hardcoded value" |
| 3.3 — Artwork fallback | Not tested | Add instruction: "Create a collection whose rule matches items — verify the collection shows poster artwork. If the primary metadata source has no artwork, a fallback source should provide it" |
| 4.2 — Rule targets specific library | Not tested | Add instruction: "Create a rule scoped to Library A, verify items from Library B are NOT matched" |
| 6.3 — Stale items / trailing pages | Not tested | Add instruction: "Delete a media item directly in Plex, then open its Maintainerr collection — page count should not include the deleted item" |
| 7.1–7.3 — Maintainerr Status | Tester has no action defined in rule | Clarify that Maintainerr Status features require at least one rule with an action. Update test instructions: "Create a rule with a delete/unmonitor action, run it, then check Overview sorting and media card modal for status badges" |

---

## Non-Issues (informational)

- **GitHub API rate limit** (`Request quota exhausted for GET /repos/{owner}/{repo}/commits/{ref}`)
  — This is the version-check call hitting GitHub's unauthenticated rate limit. Not a regression.
  Consider caching the result or using a GitHub token if this is noisy in logs.

- **"Rejected direct provider IDs" warnings** — Observed on both Plex and Jellyfin. These fire when
  the media server's external IDs resolve to a different title than expected (e.g., "Genius" resolves
  to "Genius (2017)"). Not a regression but could be noisy. Consider demoting to DEBUG level if the
  volume is high.
