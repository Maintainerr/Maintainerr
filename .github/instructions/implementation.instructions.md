---
applyTo: "**"
---

## Implementation direction

Think in terms of consistency first, not isolated fixes.
Follow the UI direction set by PRs 2543, 2545, and 2549: stable hook APIs, direct callback-driven state updates, resilient shell-first loading, and no flashy spinner regressions.
Prefer inline page feedback over toasts for normal settings saves, and keep behavior shared through `useSettingsFeedback.tsx`.
Avoid layout shift: reserve space for late-loading UI, keep tab/card structure stable, and do not let placeholders change active state or move surrounding UI.
Treat full `LoadingSpinner` as delayed, `SmallLoadingSpinner` as immediate, and validate with focused UI tests before broader refactors.

Read [ARCHITECTURE.md](../../ARCHITECTURE.md) for the system architecture overview before changing cross-module boundaries.

## PR workflow

1. **Reproduce before changing behavior.** For a bug fix, establish the current
   behavior through the real application, API, and affected services. Record the
   trigger, expected result, and observed result. If reproduction is blocked,
   state the limitation; do not present a suspected defect as confirmed.
2. **Trace the complete affected flow.** Search repository-wide for callers,
   shared functionality, state, events, and tests, including manual and scheduled
   paths. Read relevant git blame, prior PRs, and issues to distinguish deliberate
   behavior from defects. Verify external API assumptions against documentation.
3. **Define what must stay unchanged.** Identify the existing behavior the fix
   must preserve before editing. Check the affected success, failure, and recovery
   paths; include forced/manual runs, settings, and locking where relevant.
4. **Make the smallest complete fix.** Reuse existing services, providers, shared
   modals, controls, and locks. Add persistence, migrations, dependencies,
   configuration, or abstractions only when the requirement needs them. Minimize
   both the diff and maintenance burden. Fix related defects required for the
   intended outcome; report independent findings separately. Avoid opportunistic
   refactors, renames, dead-code pruning, and cosmetic cleanup. Required
   [refactoring guidelines](../../AGENTS.md#refactoring-guidelines) still apply,
   including React Hook Form migration when touching an existing form.
5. **Resolve scope precisely.** Use actual UI labels and API actions when a
   request is ambiguous. Ask only when the answer affects behavior or scope,
   while continuing independent investigation. Do not ask again for actions
   already authorized by the user.
6. **Verify observable outcomes.** HTTP success and application counters alone
   are insufficient. Inspect actual server state, requests, logs, and UI results.
   For idempotency, count real mutations; for recovery, verify the repaired state.
   Review the final diff for reproducible current-code defects and regressions;
   keep speculative concerns separate from confirmed findings.
7. **Use the real lab for affected integrations.** Exercise every affected
   provider and service in the Podman stack with real API calls, logs, and
   end-to-end behavior; use Playwright for the affected UI actions. Connectivity
   checks do not establish end-to-end coverage. Mocks supplement these checks,
   or provide an explicitly reported fallback when a service is unavailable.
   Test in the `/workspace` app, restore modified fixtures, and stop temporary
   processes. Keep evidence under ignored `.playwright-mcp/`, without credentials.
8. **Keep tests and comments purposeful.** Test observable behavior and meaningful
   regressions. Extend or parameterize existing tests before adding scaffolding;
   avoid tests that merely mirror implementation. Keep comments that explain
   non-obvious decisions and remove temporary debugging code from the diff.
9. **Validate the final diff.** Run focused tests and relevant type, lint,
   format, and build checks during development. Reserve the heavy full workspace
   suite for final PR preparation, rather than running it throughout development.
   For an initial PR, run `yarn test` from the repository root before committing.
   For PR branch updates, follow the rebase, single-commit, full-suite, and push
   sequence in the [project notes](project-notes.instructions.md#working-style-preferences-of-the-prior-maintainer).
   Wait for required checks to pass before pushing. Repeat checks when subsequent
   changes, failures, or unresolved concerns justify it. Local documentation-only
   edits need formatting, link, and consistency checks; this does not waive the
   full-suite requirement when updating a PR branch.
10. **Finish within the authorized scope.** When commit, push, or PR creation is
    authorized, complete it without another confirmation; honor instructions
    such as "do not push" or "leave uncommitted". Follow the
    [project notes](project-notes.instructions.md#working-style-preferences-of-the-prior-maintainer)
    for PR descriptions and branch updates, including the clean fast-forward
    check and no-force-push rule. Report validation results and limitations to
    the user, and keep temporary evidence out of tracked source.

## General

When implementing against any external API or SDK (Plex, Jellyfin, TypeORM, etc.), read the official API documentation to confirm behaviour. Do not guess or assume - facts only, based on current documentation.

### Workspace MCP servers

- Workspace MCP config lives in `.vscode/mcp.json` (VS Code), `.mcp.json` (Claude Code), and `.codex/config.toml` (Codex). Keep all three in sync.
- `github` MCP: read-only - use for live GitHub context, never for writes.
- Browser-driven UI validation: use the globally installed `playwright` library with system Chromium, following [AGENTS.md](../../AGENTS.md#workspace-mcp-servers). Do not use the Playwright MCP server, which often fails to connect. Save screenshots under `.playwright-mcp/`.
- **These stdio MCP servers only load when your AI client (VS Code, Claude Code, or Codex) is launched from inside devbox at `/workspace`** - `npx` (the server command) is only on PATH in the container, and the client must start at the repo root to pick up its mcp config. Launched on the bare host or from another directory, the `playwright`/`github` servers never register. Reload the editor / restart the client session after editing any mcp config.

### API documentation references

Machine-readable OpenAPI specs are deliberately not listed here. They live in
`SPECS` in [tools/api-spec-drift.mjs](../../tools/api-spec-drift.mjs), which
fetches every one of them weekly, so that list is verified rather than trusted.
Duplicating it in prose only creates a second copy that goes stale.

The references below are the ones with no fetchable spec, or that say something
the spec does not:

- Tautulli: https://docs.tautulli.com/extending-tautulli/api-reference - no machine-readable spec, a single `/api/v2?cmd=` endpoint
- Seerr: https://docs.seerr.dev/
- Ombi: no static spec; a running instance serves Swagger UI at `<url>/swagger`, and the controllers live in https://github.com/Ombi-app/Ombi under `src/Ombi/Controllers`
- Jellyfin: https://api.jellyfin.org/
- Plex (python-plexapi): https://python-plexapi.readthedocs.io/en/latest/index.html
- Plex (additional): https://www.plexopedia.com/plex-media-server/api/
- Plex (official PMS reference): https://developer.plex.tv/pms/ - authoritative for what Plex guarantees; rendered page only, no spec file to fetch. The community OpenAPI spec's `required` lists are looser (e.g. it requires `addedAt`, the official schema does not), so confirm guarantees against this page.

## Rules

1. DRY: avoid one-off logic or duplicated feedback/loading patterns.
2. Follow repository copilot instructions and existing project conventions.
3. Keep separation of concerns clear and maintenance burden low.
4. Match existing codebase patterns and avoid regressions or unnecessary abstraction.
5. UI components: favor reusable, consistent components and solid React patterns. Promote shared helpers and modals from `apps/ui/src/components/Common/` where they exist - for example use `SaveButton` and `TestingButton` instead of rolling custom save/test buttons.
6. Media server abstraction: keep `modules/api/media-server/` server-agnostic. The interface (`media-server.interface.ts`), factory, controller, and shared utilities must never import or reference Plex/Jellyfin types directly. Use `supportsFeature()` for conditional behaviour - never branch on server type in the shared layer. All server-specific logic (constants, mappers, batch sizes, caching, SDK calls) belongs exclusively in `plex/` or `jellyfin/`. Mappers are type-conversion only - no business logic. Any new method added to the abstracted layer must be implemented by all media servers - partial support belongs behind `supportsFeature()`, not in the interface itself.
7. Contracts package: any new DTOs or request/response shapes should be deliberate and minimal.
8. Database/migrations: if persistence changes are needed, keep migrations safe, reversible, and edge-case aware. All migrations MUST be generated and run via TypeORM - never manually crafted SQL. You MUST always follow [typeorm_instructions.txt](../../typeorm_instructions.txt) for migration commands and workflow. A migration is NEVER considered working until it has been tested - run it end-to-end and verify the result before treating it as done.
9. Rules/metadata systems: make sure any cache invalidation approach stays consistent with existing getter/provider patterns.
10. Rule naming standards: preserve established rule `name` and `humanName` conventions for equivalent concepts across media servers. Do not rename user-facing rule labels to encode backend caveats; keep naming stable and document server-specific semantics in code comments and focused tests instead.
11. Outbound HTTP: every client goes through `ExternalApiService` or `applyHttpRetry` (`modules/api/lib/httpRetry.ts`) - never the bare global `axios`, which carries no retry policy at all, and never a per-client `axios-retry` config. The shared policy already answers a 429 with the wait the server declared, capped at `MAX_RATE_LIMIT_WAIT_MS`; anything hand-rolled beside it only drifts.
