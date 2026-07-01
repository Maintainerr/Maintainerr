---
applyTo: "**"
---

# Maintainerr — Project Notes & Handoff Knowledge

Hard-won, non-obvious knowledge about this codebase that isn't derivable from the
code, git history, or [ARCHITECTURE.md](../../ARCHITECTURE.md). Accumulated while
working on the rule engine, media-server integrations, the Tailwind v4 migration,
and the build/migration toolchain. Agent-neutral — meant to be read by Claude,
GitHub Copilot, and Codex.

Read [ARCHITECTURE.md](../../ARCHITECTURE.md) for the system map and
[AGENTS.md](../../AGENTS.md) for the command/workflow reference first; this file
covers the "why" and the traps those don't.

---

## Conventions (apply to all committed artifacts)

These are project conventions, established through review feedback. They apply to
code, comments, tests, fixtures, docs, commit messages, and PR bodies — not to
conversational chat.

- **Call the request service "Seerr" — never "Overseerr" or "Jellyseerr".**
  Maintainerr abstracts both behind a single "Seerr" layer
  (`modules/api/seerr-api/`, `SeerrApiService`). Naming one leaks implementation
  and implies favoritism. Even when verifying behavior against a specific
  upstream's source, write "Seerr" in the output. Use a product-specific name
  only in code provably specific to it (none exists today).

- **Never use real media titles** (movies, shows, books, games) in any committed
  artifact. Use generic placeholders: "Sample Series", "Franchise A Collection",
  "a movie collection". Brand/franchise names create IP-association noise and
  date the code.

- **Prefer manual string ops over regex.** Default to `charCodeAt`, `slice`,
  `startsWith`/`endsWith`, `.toLowerCase()`, char-index while-loops. Use regex
  only when manual ops would be materially more complex (multi-line, lookahead).
  For trailing/leading slashes or whitespace, write a small char-by-char helper
  rather than `.replace(/\/+$/, '')`. Rationale: explicit, no hidden engine cost,
  no surprises on empty input or unicode.

- **Never use em or en dashes; always use a plain hyphen `-`.** This applies to
  every committed artifact: code, comments, log and UI strings, tests, commit
  messages, and docs. Do not paste `—` (U+2014) or `–` (U+2013); type `-`
  (U+002D). Disable any "smart dash" autocorrect in your editor. Rationale:
  a single ASCII dash keeps logs, diffs, and greps consistent and copy-paste
  safe. To find stragglers: `git ls-files | xargs grep -lP '[\x{2013}\x{2014}]'`.

- **Prefer the codebase's existing idiom over adding a dependency.** When a
  feature request or issue names a specific library (e.g. `p-limit` for bounded
  concurrency), check first whether the repo already solves it. It does for
  bounded concurrency: chunk + `Promise.all` (see `addBatchToCollection` and the
  metadata-refresh loop). Only add a dep when the existing idiom genuinely can't
  do the job, and say why. Such library suggestions in issues are often
  AI-sourced — don't take them at face value.

- **Scope discipline.** Separate the actual blocker from cosmetic noise and fix
  only what's needed. Before expanding scope (new deps, transformer swaps,
  cross-cutting refactors), stop and confirm — don't turn a warning fix into an
  architecture change. A known-benign warning can be left as a visible reminder
  for a future dedicated overhaul rather than masked.

- **But finish the job within the area you're touching.** If you're already in a
  subsystem and spot a _real_ correctness bug adjacent to your change, fix it and
  add coverage — "pre-existing" is not an excuse to leave a known bug. The
  distinction from scope discipline: real-bug-in-scope → fix it; benign-noise →
  leave it. For data changes, prefer **minimal behavioral change** — preserve how
  existing data evaluates today, making values explicit rather than flipping
  behavior.

### Working-style preferences of the prior maintainer

Kept for continuity; the next maintainer may adjust these.

- **PRs:** brief body (what changed and why, a few bullets). No "Test plan"
  section. No Claude Code attribution footer or `Co-Authored-By: Claude`.
  Validation is done manually + via CI.
- **Updating a PR branch:** rebase onto latest origin first (PR branches drift —
  one was 20 commits behind by the time edits finished), fold into one clean
  commit (`git reset --soft` then a single commit), run the **full** repo suite
  (`yarn turbo test`, not just affected specs), then push. Verify
  `git rev-list --left-right --count origin/<branch>...HEAD` is `0 N` (clean
  fast-forward, no force-push). Keep diffs minimal — don't rename existing
  variables without cause.

---

## UI (apps/ui)

### Tailwind CSS v4 (CSS-first)

The UI is on **Tailwind v4, CSS-first** — there is **no `tailwind.config.js`**.

- Built via the `@tailwindcss/vite` plugin (not PostCSS). No `postcss.config`,
  no `autoprefixer`, no `@tailwindcss/aspect-ratio`.
- `apps/ui/styles/globals.css` is the single source of truth: `@import
'tailwindcss'`, `@plugin "@tailwindcss/forms" { strategy: base; }`,
  `@plugin "@tailwindcss/typography";`, and a `@theme` block defining the custom
  palettes (error, success, info→zinc, warning→amber, maintainerr,
  maintainerrdark), `--font-sans`, `--breakpoint-xs`. Custom transition
  utilities: `@utility transition-width` / `transition-max-height`.
- Prettier uses `tailwindStylesheet: './styles/globals.css'` (not
  `tailwindConfig`).

**v4 constraints (apply whenever you write UI):**

- `bg-opacity-*` / `text-opacity-*` don't exist → use the `/<n>` slash syntax
  (`bg-zinc-900/80`). The old opacity classes render fully opaque, silently.
- `@tailwindcss/forms` is loaded with `strategy: base` on purpose — its default
  strategy registers a `.form-input` utility that collides with (and, under v4
  layer ordering, beats) the app's own `.form-input` component class. Don't
  change the strategy.
- Checkbox focus ring = blue ring + **white offset ring**; `focus:ring-0` alone
  leaves the white offset — you also need `focus:ring-offset-0`.
- `@tailwindcss/typography` prose colors must be set via `--tw-prose-*` vars in an
  **unlayered** `.prose` rule (layered rules lose to the plugin's own `.prose`).
- v4 class names: `shadow-sm` (not `shadow`), `rounded-sm` (not `rounded`),
  `outline-hidden` (not `outline-none`), `bg-linear-to-*` (not `bg-gradient-to-*`).
- **Checkbox standard:** there is one `.checkbox` class in globals.css
  (`@layer components`). Every `<input type="checkbox">` uses
  `className="checkbox"` and nothing else — it bundles size/rounding/maintainerr
  fill/zinc border + the no-ring focus fix. Don't reintroduce per-checkbox inline
  styling.

**v4.x features in use:**

- `color-scheme: dark` is set on `html` (base layer) — native controls render
  dark; don't re-add per-control dark hacks.
- The `ul.cards-vertical` grid breakpoint is a **`@container` query** (440px);
  Overview/Content wraps the grid in `<div className="@container">`. It sizes to
  the wrapper, not the viewport.
- `field-sizing-content` on the rule-group Description (AddModal) and overlay Text
  (PropertiesPanel) textareas (auto-grow).
- `text-shadow-sm` on MediaCard poster-overlaid year/title/summary.
- **Default border color is `currentColor`** (v4 Preflight `border:0 solid`;
  there is no compat shim). If you add a bordered element, give it an explicit
  `border-*` color — the app standard divider is `border-zinc-700`.

### UI implementation conventions

- **Always prefer the shared UI primitives first.** Before building bespoke form
  or settings chrome, check `apps/ui/src/components/Forms/` and
  `apps/ui/src/components/Common/`. Today that means using shared field
  components such as `Input`, `InputGroup`, `InputAdornment`, `FieldJoin`,
  `Select`, `SelectGroup`, `SelectAdornment`, plus shared action controls like
  `SaveButton` and `TestingButton`, instead of recreating equivalent markup and
  Tailwind classes inline. If something is missing, extend the shared primitive
  rather than introducing a one-off version in a page component.
- **DRY** — no one-off duplicated feedback/loading patterns. Use
  `apps/ui/src/components/Settings/useSettingsFeedback.tsx` for inline page
  feedback (not toasts) on normal settings saves. For joined field layouts and
  prefix/suffix adornments, compose the `FieldJoin` / `SelectGroup` /
  `*Adornment` components above rather than repeating their Tailwind classes
  inline.
- **Avoid `useEffect` and `useCallback`** — prefer derived values, event
  handlers, and library-native reactive APIs (e.g. react-hook-form's `values`
  option to sync a form to loaded data instead of `useEffect(reset)`). An effect
  that resets/derives state from an unstable reference (a hook returning a fresh
  object each render) causes infinite render loops → vitest OOM/SIGTERM in CI.
- **Loading spinners:** full `LoadingSpinner` = delayed (only when a wait is
  expected); `SmallLoadingSpinner` = immediate inline feedback.
- **Layout stability:** reserve space for late-loading UI; keep tab/card structure
  stable; placeholders must not change active state or shift surrounding UI.
- Favor reusable, consistent components and solid React patterns; avoid
  unnecessary abstraction; match existing patterns to avoid regressions.

---

## Rule engine (apps/server, modules/rules)

### Comparator: keep EXISTS / value-comparison orthogonal

Value-comparison operators (BEFORE, AFTER, EQUALS, NOT_EQUALS, …) stay
**fail-closed** when the operand is missing. Existence is handled separately by
**EXISTS / NOT_EXISTS**. Do **not** silently expand a comparison to also mean
"never happened."

Why it matters: special-casing BEFORE-on-null for temporal properties
(`lastViewedAt`, `sw_lastWatched`) makes `NOT_EQUALS <date>` match every
never-watched item — a semantic expansion, not a fix. The correct layer for
"never watched" is the **getter contract** (null = confirmed absent,
undefined = error), not the comparator.
Users get "never watched OR older than X days" by composing
`NOT_EXISTS OR BEFORE X` explicitly. Push back on rule-engine fixes that change
what BEFORE/AFTER/EQUALS/NOT_EQUALS do for null/undefined inputs.

### Section operator semantics

Each rule section combines with the previous via the operator on the section's
**first** rule. An unset operator is stored as `null`, so the comparator must
null-guard before coercing — `+null === 0` is `true` in JS, which would
otherwise read an unset operator as AND. Within-section default is OR;
section-boundary default is AND. YAML export/import must use a **null check**
(not a truthy check) for the operator, since AND is `0` and would be dropped.

### Rule evaluation performance

- **Operand resolution runs in bounded-parallel batches.**
  `rule.comparator.service.executeRule` resolves firstVal/secondVal for all items
  in chunks via `Promise.all` (the codebase idiom — not `p-limit`), then runs the
  mutation loop. Knob: `RULE_EVALUATION_CONCURRENCY` in `rules.constants.ts`
  (default **8**). Keep this as a **single global batching layer** — do not nest
  it inside getters, or you get N×N fan-out.
- **Don't raise the concurrency.** 8 is deliberate: higher values over-drive a
  constrained all-in-one NAS's Tautulli history queries past the request timeout,
  triggering axios retries that pin CPU and stall the run. There is intentionally
  no user-facing knob.
- **`ArrLookupCache`** (`modules/rules/helpers/arr-lookup-cache.ts`): a run-scoped
  memo created in the executor for the eval loop only, never passed to
  `handleCollection`/actions, so empty-show cleanup still reads fresh. Used only
  by the sonarr/radarr getters (others already cache at the API layer); the API
  lookup itself stays `getWithoutCache`.
- **Do not retain full comparison stats for every scanned item.**
  `RuleExecutorService` should keep detailed `IComparisonStatistics` only for
  items that may be newly added to a collection. Holding per-item stats across
  the full library can OOM large runs, and removal paths do not need fully
  populated reasons.
- All rule caches are in-memory and `cacheManager.flushAll()` runs at every
  rule-group run start (persistent metadata caches like tmdb/tvdb are exempt) —
  runs are cold-start by design; only SQLite persists.

### Streamystats watchlist rules — Jellyfin only

`Application.STREAMYSTATS` (enum id **8**, see `packages/contracts/src/rules/`)
is the Jellyfin analog of Tautulli-for-Plex. Two properties:
`isInWatchlist` (BOOL) and `watchlistedByUsers` (TEXT_LIST). There is
intentionally no `isPromoted` property — promoted-only-private lists are
unreachable with the auth Maintainerr has (see below).

Non-obvious facts:

- A Streamystats "watchlist" is a user-created **named curated list** (tables
  `watchlists` / `watchlist_items`), NOT a Plex-style personal want-to-watch
  flag. Its `itemId` equals the Jellyfin item ID, so membership maps directly.
  Do not reuse the Plex watchlist property semantics.
- The watchlist endpoints authenticate with
  `Authorization: MediaBrowser Token="<jellyfin_api_key>"`, **not** `Bearer`
  (only the item-details endpoint accepts Bearer). `getWatchlistMembership()`
  overrides the Authorization header per request.
- Maintainerr authenticates with a Jellyfin **server API key**, which Streamystats
  resolves to a `system-api-key` pseudo-user → **only PUBLIC watchlists are
  reachable**. Private/promoted-only lists are intentionally invisible.
- The membership snapshot is cached in the shared `streamystats` NodeCache (key
  `watchlist-membership`), which is `flushAll()`'d between rule-group runs — the
  correct lifecycle (no hand-rolled `Date.now()` memo). TTL/key constants live in
  `modules/api/streamystats-api/streamystats-api.constants.ts`.
- The getter returns `undefined` (transient skip) when membership is null;
  `false`/`[]` only when genuinely fetched. This prevents a failed lookup from
  flipping negative list comparisons and matching protected items.
- Gating mirrors Tautulli: UI gate folded into the Jellyfin line in RuleInput
  `shouldFilterApplication`; server gate in `getRuleConstants()` removes the
  Application when `streamystats_url` / `jellyfin_api_key` are unset. Emby stays
  unsupported (Streamystats is Jellyfin-only).

### Rule regression harness

`apps/server/test/rules-test-matrix.e2e.ts` boots a real Nest app + real
`RuleComparatorServiceFactory` / `RulesController` / `RulesService` and POSTs to
`/api/rules/test`, with `MediaServerFactory` + `ValueGetterService` mocked so the
app behaves as if the media server is live and returning values. Each scenario
lists `rules` (sections + operators) and `values` (shifted per getter call, in
rule order). It is a **script that prints JSON** (`yarn workspace
@maintainerr/server test:e2e`), meant for cross-refactor comparison — add
scenarios here to regression-test comparator / section-combine behavior end-to-end
through the HTTP path. Use this when you want "real results" without standing up a
mock HTTP media server. (For a fuller live setup, see the dev mocks below.)

### Testing YAML import/export and community-rule import

Two distinct import paths — they do **not** share code, so test both:

- **YAML file export/import** → `POST /api/rules/yaml/encode` and `/yaml/decode`.
  `decode` runs `getCustomValueFromIdentifier` (it does not).
- **Community rules** → fetched from `https://community.maintainerr.info`, served
  by `GET /api/rules/community` as `JsonRules` (an **array**, already parsed — not
  a string; `repr()` just makes it look Python-styled). Imported via the
  cross-server converter `POST /api/rules/migrate` (`migrateImportedRuleDtos`).
  This path never touches the YAML decoder.

No media server is required for either (both are parse + migrate, no live getter
calls); just `yarn dev`. `mediaType` is the **string** union (`"movie"`/`"show"`,
from `@maintainerr/contracts`), not a number — encode/decode reject a mismatch.

Quick checks (Jellyfin server configured):

- **Round-trip:** `GET /api/rules/<id>/rules` → parse each row's `ruleJson` →
  `encode` → `decode` and assert the rule count is preserved and the YAML has no
  `App.undefined`.
- **AND survives export (#2971):** encode a 2-section group whose section-1 first
  rule has `operator: 0` and assert the YAML contains `operator: AND`.
- **Unresolved property is skipped, not rejected (#2976):** corrupt one
  `firstValue` in encoded YAML, decode, assert `code:1` with `skipped: 1`.
- **Cross-server remap (#2976):** `POST /api/rules/migrate` with a rule mixing a
  Plex media-server prop (`[0, …]`) and a Seerr value (`[3, …]`); assert the
  media-server field remaps to the configured app and the Seerr field is left
  untouched (firstVal/lastVal migrate independently).
- **All v2.0.0+ community rules import:** fetch `/api/rules/community`, filter
  `appVersion >= 2.0.0`, POST each rule's `JsonRules` array to `/api/rules/migrate`,
  assert every one returns `code:1` (incompatible props for the configured server
  come back as `skipped > 0`, which is correct, not a failure).

---

## Cross-server media abstraction

- **Emby/Jellyfin set a movie's `parentId` to its library-folder id** (Emby's
  `getParentId` falls back to `item.ParentId`); Plex leaves a top-level movie's
  parent empty. So any logic that infers "this item is a season/episode" from
  `parentId`/`grandparentId` **presence** misclassifies Emby/Jellyfin movies.
  **Always switch on the server-agnostic `item.type`**
  (`'movie' | 'show' | 'season' | 'episode'`), never on
  `parentId`/`grandparentId` truthiness. (`notifications.service.ts` `getTitle`
  is one place this matters.)
- **Emby user-scoped reads differ from writes.** Collection metadata reads and
  full-library size scans should prefer `/Users/{userId}/Items...` when
  `emby_user_id` is configured; the plain `/Items/...` path can miss or 404 in
  user-authenticated flows even though the update write endpoint remains
  `POST /Items/{itemId}`.
- **"Is this item gone?" → use `IMediaServerService.itemExists`, never
  `getMetadata` falsiness.** `getMetadata` returns `undefined` for both a
  genuinely-absent item _and_ a transient error (network / 5xx / auth) on all
  three servers, so keying a deletion/cleanup off `!getMetadata()?.id` can drop
  live data on a blip. `itemExists` returns `false` only on a confirmed
  404/empty result and **throws** on anything inconclusive; callers default to
  "present" on throw (`let exists = true; try { … } catch { logger.debug }`) so
  uncertainty never deletes. It's the single existence primitive on the shared
  interface — consumed by the collection handler, `removeStaleCollectionMedia`,
  and the overlay processor — so don't reintroduce a per-subsystem copy.

---

## Contracts migration direction (@maintainerr/contracts)

When extracting transport shapes (Zod schemas, request/response DTOs) into
`@maintainerr/contracts`, **design fresh contract-owned DTOs** that describe the
actual API payload. Do **not** promote server-side interfaces verbatim — contracts
must stay transport-only.

- Server interfaces (e.g. `ICollection` in
  `modules/collections/interfaces/collection.interface.ts`) carry server-only
  concerns (entity refs, `media?: CollectionMedia[]`). Hoisting those into
  contracts would force contracts to depend on server concerns — wrong direction.
- Audit referenced types before moving a schema. If they pull in entity classes or
  ORM-shaped fields, don't promote as-is; define a plain DTO/Zod schema in
  contracts capturing only the payload, then adapt the server type to map into or
  extend it.
- Types already transport-oriented (e.g. `CollectionMediaChange` in
  `modules/collections/interfaces/collection-media.interface.ts`) are clean
  promotion candidates. This is a multi-PR effort — untangle ownership first, then
  migrate schemas.
- **Build contracts before trusting downstream errors.** When shared types change
  in `packages/contracts`, run the contracts build first. Server/UI diagnostics
  can disagree while one side still resolves generated `dist` types and the
  other resolves source files.

---

## Build, test & migrations

### Jest transform & circular imports

Server tests run through **`@swc/jest`** (not ts-jest). The codebase has
circular dependencies — `forwardRef(() => X)` constructor injections plus
bidirectional TypeORM entity relations — kept SWC-safe via TypeORM `Relation<>`
wrappers on relation props and type-only import aliases on `forwardRef`-injected
constructor params (DI tokens unchanged). **If you add a cross-module import that
closes a cycle, follow that pattern**, or SWC's strict CommonJS live bindings
will turn it into a runtime TDZ `ReferenceError: Cannot access 'X' before
initialization`.

Yarn uses the **node-modules linker** (`.yarnrc.yml` → `nodeLinker: node-modules`,
not PnP), so `node_modules/.bin/jest` and `node_modules/jest/bin/jest.js` exist and
standard Jest-under-Node entrypoints work without a PnP shim.

### TypeORM repository conventions

The server is on **TypeORM 1.x** (`better-sqlite3`). Two conventions to follow
when writing repository code:

- **`relations` and `select` use the object form** —
  `relations: { ruleGroup: true }`, not the array form. `find`/`findOne` only
  accept objects.
- **Never put a bare `null`/`undefined` in a `where`.** TypeORM 1.x throws on
  them (the default `invalidWhereValuesBehavior` is `throw`, and we keep that
  default rather than masking it). To match SQL `NULL`, use `IsNull()` —
  e.g. `where: { ruleGroupId: IsNull() }`, `where: { sizeBytes: Not(IsNull()) }`.
  For an optional value that may be absent, omit the key (conditional spread:
  `...(x !== undefined ? { x } : {})`) or guard before querying — don't pass it
  through. `where: {}` (no keys) is fine for the settings-singleton lookups.
  Note: a bare `null` does **not** mean "ignore the filter" — older code that
  relied on that was a latent bug (it matched everything); use `IsNull()`.

### Writing DATA migrations (backfills, no schema change)

- `migration:generate` **cannot** produce them — it diffs entity metadata vs DB
  and reports "No changes in database schema were found." Scaffold with
  `migration:create src/database/migrations/<Name>`.
- Write `up()` using TypeORM's **QueryBuilder**
  (`queryRunner.manager.createQueryBuilder()…`), **not** raw
  `queryRunner.query('SELECT/UPDATE…')` — the implementation rules forbid manually
  crafted SQL.
- Migration **spec files must NOT live under `src/database/migrations/`** — the
  datasource glob (`src/database/migrations/**/*.ts`) makes the `migration:run`
  CLI compile them with ts-node and fail on jest globals. Put them in a sibling
  dir like `src/database/migration-tests/` (jest rootDir=src still finds them).
- Test data migrations with **in-memory SQLite**: `new DataSource({
type:'better-sqlite3', database:':memory:', entities:[], synchronize:false })`,
  create the table, run `migration.up(queryRunner)`, assert. QueryBuilder-on-table-
  name needs no entity registration.
- `apps/server/.gitignore` ignores `/dist-test` (output of `test:e2e` tsc) — don't
  `git add -A` blindly after `test:e2e`.

### TypeORM migration CLI workaround

`yarn workspace @maintainerr/server migration:run` / `migration:generate` (the
`typeorm-ts-node-commonjs` CLI) does **not** run out-of-the-box: ts-node errors
with `TS5011` (`apps/server/tsconfig.json` sets `declaration:true`/`outDir` but no
explicit `rootDir`) and "Cannot find name 'process'" (no node types for ts-node).
Workaround:

```jsonc
// apps/server/tsconfig.migrate.json (throwaway; safe to delete, gitignore-able)
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": false,
    "declarationMap": false,
    "composite": false,
    "incremental": false,
    "sourceMap": false,
    "rootDir": "./",
    "types": ["node"],
  },
}
```

Then: `cd apps/server && TS_NODE_PROJECT=./tsconfig.migrate.json yarn migration:run`
(or `migration:generate <path>`).

**Verifying a migration:** the app uses `synchronize:false` + `migrationsRun:true`
(`typeOrmConfig.ts`), so `migration:run` ≡ `yarn dev` for schema. Definitive sync
check: build the branch DB from empty (`rm data/maintainerr.sqlite*` then
`migration:run`), then `migration:generate` must report **"No changes in database
schema were found."** `data/maintainerr.sqlite` is gitignored.

---

## Local dev: seeded DB + mock media servers

For end-to-end checks of media-server-dependent flows (rules, collections,
overview, storage) without a real Plex/Jellyfin — and to drive the UI with
Playwright against deterministic data. Full workflow is in
[AGENTS.md](../../AGENTS.md); the scripts live in `tools/dev/`:

- `tools/dev/fake-jellyfin.mjs` — stateless mock Jellyfin (`:8096`). Answers the
  real `@jellyfin/sdk` paths the adapter calls: `GET /System/Info/Public`,
  `GET /Users` (must include a `Policy.IsAdministrator` user), `GET
/Library/MediaFolders` (library ids must be `jellyfin-movies`/`jellyfin-shows`
  to match the seed), and `GET /Items?…&ids=<id>` (the LIST form — getMetadata
  hydration uses this, not `/Items/{id}`). Item images 302-redirect to picsum.
- `tools/dev/fake-plex.mjs` — stateless mock Plex (`:32400`); covers the Plex-only
  getter paths.
- `tools/dev/fake-radarr.mjs` — mock Radarr v3 (`:7878`). The media-server mocks
  don't cover \*arr, so the collection-handler → RadarrActionHandler flow
  (DELETE / UNMONITOR / add-import-list-exclusion) needs this. Resolves any
  `tmdbId` to a movie (movie id == tmdbId), and faithfully replicates Radarr's
  exclusion semantics: `POST /exclusions/bulk` de-dupes server-side (idempotent),
  singular `POST /exclusions` returns HTTP 400 on a duplicate. The seed's "Stale
  Movies" collection is UNMONITOR + listExclusions with `tmdbId`s set, so
  `POST /api/collections/handle` exercises this path end-to-end. No fake Sonarr
  exists yet, so the seed's show collection is DO_NOTHING.
- `tools/dev/seed-db.mjs` — the only DB-touching script. Resets and seeds
  collections / rule groups (with rules covering ~all properties) / settings /
  notifications / exclusions / overlays into `data/maintainerr.sqlite`. Target a
  server with `MEDIA_SERVER=plex|jellyfin` (default jellyfin). Run with `yarn dev`
  **stopped** (SQLite is single-writer), then restart.

**Key limitation:** a DB-only seed does **not** populate the collection-detail
media grid or Overview — `CollectionsService.hydrateCollectionMediaWithMetadata`
hydrates each row against the **live** media server and drops any id it can't
resolve. You need the matching mock running for grids to render and for rule
evaluation to run end-to-end via `POST /api/rules/test {rulegroupId, mediaId}`.

After editing server code, **restart `yarn dev`** — a long-lived dev server serves
stale getter logic. Watchlist / plex.tv user enrichment can't be mocked locally
(they hit plex.tv) and degrade gracefully.

---

## Tooling: MCP servers

The workspace configures MCP servers (kept in sync across `.codex/config.toml`,
`.mcp.json`, and `.vscode/mcp.json`):

- **github** (HTTP, read-only): use for GitHub queries (issues, PRs, repo
  metadata) instead of shelling out to `gh` when an MCP tool is available.
- **playwright** (stdio, `--headless --isolated`): use for browser-driven testing
  / verification of UI changes instead of asking for manual verification. Save
  screenshots under `.playwright-mcp/`.
