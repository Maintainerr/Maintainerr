# Implementation Plan — Tester Feedback Follow-Up (April 6, 2026)

This document turns the findings in `docs/developer-action-items-2026-04-06.md` into an implementation order, file-level work plan, and validation strategy.

## Goals

- Fix the two clear user-facing regressions first: setup gating and backup feedback.
- Eliminate false failure notifications before tuning lower-severity behavior.
- Fix Plex collection consistency issues at the root cause instead of layering delays everywhere.
- Improve observability where tester reports point to ambiguous runtime behavior.
- Validate with focused tests that match the April 4–5 testing plan.

## Guiding Principles

- Reuse shared UI behavior where possible, especially `useSettingsFeedback` for inline settings feedback.
- Keep loading behavior stable: no new layout shift, no regression to eager full-page spinners.
- Keep media-server abstractions server-agnostic. Plex-specific and Jellyfin-specific behavior stays in their adapter layers or guarded server-specific code paths.
- Prefer one coherent success or failure outcome per run. Do not allow a task to both complete successfully and emit a failure notification.
- Add targeted tests around the bug surface before broad refactors.

## Workstream 1: Media Server Setup Gating

### Why first

This is a critical UX bug. The app currently unlocks Overview, Rules, and Collections as soon as `media_server_type` is saved, even if the rest of setup is incomplete.

### Confirmed root cause

The UI uses `isNotConfigured: !mediaServerType` in `apps/ui/src/hooks/useMediaServerType.ts`. The server already has a stricter setup check in `SettingsService.testSetup()` that requires actual Plex or Jellyfin credentials.

### Implementation

1. Extend `apps/ui/src/hooks/useMediaServerType.ts` so it derives two separate concepts:
   - media server type selected
   - media server setup complete
2. Mirror the server-side setup criteria from `apps/server/src/modules/settings/settings.service.ts#testSetup` in the UI hook:
   - Plex: hostname, name, port, and auth token must exist
   - Jellyfin: URL and API key must exist
3. Update `apps/ui/src/components/Layout/MediaServerSetupGuard.tsx` to gate on setup completeness instead of only checking whether a type exists.
4. Update `apps/ui/src/components/Settings/index.tsx` and `apps/ui/src/components/Settings/Tabs/index.tsx` so tab disabling uses the same completeness rule.
5. Add `/settings/logs` to the setup allowlist so users can troubleshoot setup failures before setup is complete.

### Expected outcome

- Selecting Plex or Jellyfin alone will no longer unlock the application.
- Users can reach Main settings and Logs during setup.
- UI behavior matches the server-side setup guard semantics instead of using a weaker frontend-only rule.

### Tests

- Update `apps/ui/src/components/Layout/MediaServerSetupGuard.spec.tsx`:
  - redirects when type is selected but required credentials are incomplete
  - allows access when setup is complete
  - allows Logs during setup
- Add or update settings tab tests so disabled routes remain blocked until setup is complete.

## Workstream 2: Database Backup Success Feedback

### Why second

This is a straightforward regression with a clear repository pattern for the fix.

### Confirmed root cause

`apps/ui/src/components/Settings/Main/DatabaseBackupModal.tsx` calls `onClose()` immediately after a successful download, so the user gets no inline confirmation.

### Implementation

1. Reuse the existing inline settings feedback flow from `apps/ui/src/components/Settings/useSettingsFeedback.tsx`.
2. Keep the alert rendered by the Main settings page in `apps/ui/src/components/Settings/Main/index.tsx`.
3. Change `DatabaseBackupModal` so a successful backup reports success back to the parent page before closing.
4. Use an inline success message such as `Database backup downloaded`.
5. Preserve the current modal error behavior for failed downloads.

### Expected outcome

- Backup success is visible in the standard settings alert slot.
- No toast is introduced.
- The modal still closes cleanly after a successful backup.

### Tests

- Add or update modal tests to verify:
  - successful backup triggers inline success feedback
  - failed backup keeps the modal open and shows inline error

## Workstream 3: False Failure Notifications

### Why third

This is the highest-risk backend behavior because it undermines trust in scheduled jobs and notifications.

### Confirmed code risk

`apps/server/src/modules/rules/tasks/rule-executor.service.ts` emits `MaintainerrEvent.RuleHandler_Failed` from inner paths that can still return control to the outer executor, which then logs completion and emits `RuleHandler_Finished`. That makes it possible to notify failure even when the overall run appears successful.

The collection handler only emits `CollectionHandler_Failed` during the `testConnections()` precheck path in `apps/server/src/modules/collections/collection-worker.service.ts`, so the collection-side false notification needs runtime clarification and tighter logging before changing semantics.

### Implementation

1. Refactor rule execution failure handling so failure notification emission happens at one top-level decision point per rule-group execution.
2. Replace inner `RuleHandler_Failed` emissions in helper paths with explicit return-state signaling or thrown errors that the top-level executor handles consistently.
3. Make the final rule-group outcome mutually exclusive:
   - success path
   - aborted path
   - failed path
4. Add run-scoped debug logging around collection-handler precheck failures so notification causes are explicit.
5. Review whether any other event listener or notification path can infer failure from non-fatal warnings.

### Expected outcome

- A successful rule run will not trigger a `Rule Handling Failed` notification.
- A collection run that completes normally will not trigger a `Collection Handling Failed` notification.
- Failure notifications will correspond to a clear, logged failure state.

### Tests

- Expand `apps/server/src/modules/rules/tasks/rule-executor.service.spec.ts` to cover:
  - handled inner exceptions that should not emit failure notifications
  - top-level failures that must emit failure notifications
  - missing collection or invalid execution states producing one failure outcome only
- Add targeted tests around collection notification emission if coverage is currently missing.

## Workstream 4: Collection Handler Observability

### Why this is separate from notifications

The tester report about Jellyfin collections “disappearing” is partly an observability problem. The current collection worker only logs collections that are skipped because they are `Do Nothing`, or collections that actually have due media to handle.

Collections with zero due items are currently silent.

### Confirmed code behavior

In `apps/server/src/modules/collections/collection-worker.service.ts`, collections are filtered into `collectionsToHandle`, then only added to the processing group if `mediaToHandle.length > 0`. If no media is due, the loop continues with no log line.

### Implementation

1. Add explicit logging for active collections with no due media to handle.
2. Keep the existing `Do Nothing` skip log, but distinguish it from `No due media`.
3. Log a small run summary after collection enumeration:
   - total active collections
   - skipped because `Do Nothing`
   - skipped because no due media
   - actually handled
4. Ensure this logging does not spam normal runs with per-item detail.

### Expected outcome

- The absence of a collection from “Handling collection” logs becomes explainable.
- Future tester reports can distinguish a real filtering bug from a collection with nothing due.

### Tests

- Add targeted worker tests if they exist for collection logging decisions.
- If unit coverage is too expensive here, validate via focused manual run logs.

## Workstream 5: Plex Empty-Collection Consistency

### Why now

The stale child count bug is a correctness issue that can cause wrong automatic cleanup behavior.

### Confirmed root cause

`apps/server/src/modules/collections/collections.service.ts` fetches `serverColl.childCount`, then immediately fetches children and trusts the child list length instead. Tester logs show the metadata child count is already correct while the child enumeration is stale after removals.

### Implementation

1. Update `checkAutomaticMediaServerLink()` in `apps/server/src/modules/collections/collections.service.ts` so the Plex empty-collection cleanup uses `serverColl.childCount` as the primary source of truth.
2. Only fall back to fetching full children if needed for a specific edge case, not as the default emptiness check.
3. Keep the current Jellyfin skip behavior for automatic empty cleanup.
4. Add clear debug logs indicating when metadata count versus child enumeration is being trusted.

### Expected outcome

- Recently updated Plex collections will not be misclassified as non-empty or empty due to stale child enumeration.
- The cleanup decision becomes cheaper and more consistent.

### Tests

- Add a collection service test where:
  - `getCollection()` returns a nonzero `childCount`
  - `getCollectionChildren()` returns stale data
  - the collection must not be deleted

## Workstream 6: Plex Batch Add Diagnostics and Error Classification

### Why not earlier

The current behavior is noisy and slow but eventually succeeds. We should first improve diagnosis before changing throughput behavior.

### Confirmed code risk

`apps/server/src/modules/api/media-server/plex/plex-adapter.service.ts` falls back from batch add to per-item add, but it does not currently classify HTTP 400 errors clearly enough for the operator. The tester specifically called out the misleading “Is the application running?” style error message for 4xx responses.

### Implementation

1. Improve error classification in the Plex adapter so HTTP 4xx responses are treated as request failures, not connectivity failures.
2. Log batch add failures with chunk size, chunk position, and response message/body where available.
3. Keep the per-item fallback so failed item reporting remains precise.
4. Only add a small inter-batch throttle if the improved diagnostics indicate Plex is rejecting bursts rather than specific payload content.
5. Keep any throttle Plex-specific in `plex.constants.ts` or the Plex adapter.

### Expected outcome

- Operators can tell whether large batch failures are request-shape issues, duplicates, or transient rate problems.
- Logs are less misleading.
- We avoid changing batch size or timing blindly.

### Tests

- Extend `apps/server/src/modules/api/media-server/plex/plex-adapter.service.spec.ts` to cover:
  - batch failure with fallback
  - HTTP 400 classification
  - network-level failure classification remaining distinct from request failures

## Workstream 7: Log Stream Error Triage

### Why last

This is low severity and may be normal disconnect behavior rather than a real backend bug.

### Current assessment

`apps/server/src/modules/logging/logs.controller.ts` looks like a standard SSE setup. The reported log line may reflect a UI-side EventSource disconnect during navigation rather than a server defect.

### Implementation

1. Confirm whether the Logs UI cleans up SSE connections on unmount.
2. Determine whether the reported `Settings.Logs.stream` client error is expected during navigation.
3. If expected, reduce the severity or improve the message.
4. If unexpected, fix the UI cleanup path or SSE error handling accordingly.

### Expected outcome

- Either the error is removed as noise, or a real connection lifecycle bug is fixed.

## Documentation Updates

The April 4–5 testing plan should be clarified alongside code changes so manual QA has concrete steps for ambiguous cases.

### Add or clarify these test instructions

- Plex PIN timeout: explain how to trigger the 5-minute timeout case.
- Per-install client ID: direct testers to server logs, not Plex dashboards.
- Artwork fallback: explain what success looks like when the primary metadata source lacks artwork.
- Library-scoped rule testing: define a two-library validation flow.
- Stale item pagination: explain how to validate trailing-page correctness after deleting media directly in Plex.
- Maintainerr Status tests: require at least one actionable rule before validating badges, sorting, and modal details.

## Recommended Execution Order

1. Media server setup gating
2. Database backup feedback
3. Rule failure notification cleanup
4. Collection handler observability and collection failure-notification tracing
5. Plex empty-collection consistency
6. Plex batch diagnostics and error classification
7. Log stream triage
8. Test-plan documentation cleanup

## Validation Plan

### Automated

- UI tests for setup guard, tab disabling, Logs allowlist, and backup feedback
- Server tests for rule execution failure emission, collection link cleanup, and Plex adapter error handling

### Manual

- Start fresh setup, pick Plex or Jellyfin, verify nav remains locked until setup is complete
- Open Logs during setup and confirm accessibility
- Run database backup and confirm inline success feedback
- Run a Plex rule with large collection adds and inspect new batch diagnostics
- Run a rule set that completes successfully and confirm no false failure notification is sent
- Run collection handling with active collections that have no due media and confirm logs explain the outcome
- Validate no layout shift or spinner regressions across settings pages

## Risks and Constraints

- The UI setup check should stay aligned with server semantics. If the server-side setup requirements change later, frontend logic should be kept in sync.
- Notification changes must preserve legitimate failure reporting. The fix should reduce false positives without muting real failures.
- Plex batch tuning should remain evidence-driven. Do not change batch size or add throttling without confirming the failure mode.
- Collection logging improvements should stay concise enough for scheduled jobs.

## Definition of Done

- Critical setup-gating and backup-feedback regressions are fixed.
- False-positive failure notifications no longer trigger for successful runs.
- Plex automatic collection cleanup uses reliable data after removals.
- Plex batch failures are logged and classified clearly.
- Collection handler logs explain silent collections.
- Focused tests cover the changed behavior.
- Manual QA steps in the testing plan are clarified where the original report found ambiguity.