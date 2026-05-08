---
applyTo: "**"
---

## Release review — how to audit a release candidate before tagging

Read [ARCHITECTURE.md](../../ARCHITECTURE.md) for the system architecture overview before auditing cross-module or runtime changes.

Use this checklist when asked to do a production-readiness review
between the last released tag and the current release candidate. The
goal is to catch real regressions and security issues without
re-litigating decisions that were already made deliberately in merged
changes.

### 0. Read intent before reading diffs

This is the single most important step. Skipping it produces false
positives and wastes reviewer context on deliberate changes.

1. `git log <lastTag>..HEAD --oneline` — get the full commit list.
2. `git log <lastTag>..HEAD --format="%H %s" | grep -iE "feat|fix|refactor|security|perf"`
   — isolate the substantive commits.
3. For every non-trivial PR number referenced in a commit subject
   (`(#1234)`), run `gh pr view <n> --json title,body` and read the
   description in full. Pay special attention to sections titled
   "Key design decisions", "Notes", "Tradeoffs", "Accepted edge cases".
4. For fix-style commits without a PR, `git show <sha>` and read the
   body.

Anything explicitly called out in a PR body as intentional is not a
finding. Examples of patterns that often look like bugs but may be
deliberate:

- Logs quieted or downgraded from `warn`/`error` to `debug`
- Overwriting user-configured settings during auto-recovery flows
- Read-modify-write without a mutex for a state that the PR labels
  "accepted edge case"
- Extra network calls where the PR explains they fix a data-correctness
  bug
- Security fixes that intentionally address a specific flagged sink or
  exploit path without broadening the change scope

### 1. Inventory the diff

```bash
git diff <lastTag>..HEAD --stat | tail -60
git diff <lastTag>..HEAD --name-status | grep '^A' # added files
git diff <lastTag>..HEAD --name-only | wc -l       # churn size
```

Flag anything that looks like it needs a migration, a configuration
change, a client contract update, or release-note coverage — those are
common sources of upgrade-path surprises.

### 2. High-risk files to read in full

Always read these diffs end-to-end, even if small:

- Any database migration or schema file
- Any settings, configuration, DTO, or persistence layer change
- Any rule executor, scheduler, queue, or background task change
- Any external service adapter, client, or integration helper
- Any shared contract or cross-process type change
- Any action handler or code that mutates third-party state
- Any new controller, route, or request handler
- Any authentication, authorization, logging, or request-building change

### 3. What to actually look for

#### Migrations

- Up and down paths both present and symmetric
- `INSERT INTO temporary_*` column list matches the `SELECT` column list
- No manually written DDL — must be TypeORM-generated
  (see `.github/instructions/typeorm_instructions.txt`)
- Default values provided for every new `NOT NULL` column
- Indexes recreated after the table rebuild
- Data transforms (e.g. backfill from a legacy flag) are lossless on
  the down path, or the down path is documented as destructive in the
  release notes

#### Stateful domain logic / background execution

- Renames should be mechanical — verify no semantic parameter was lost
- Reads of derived state should still go through the canonical helper or
  accessor, not a stale raw field
- Any deletion or removal API should receive explicit scope when the
  intent is scoped

#### Shared abstraction layers

- Shared layers must not import provider-specific types or constants
- New interface methods must be implemented by every adapter, or be
  explicitly gated behind a feature-capability check

#### Action handlers and external mutations

- New action values are handled by every affected dispatcher and remain
  reachable from the caller
- `switch` cases with declarations use block scope
- No-op states short-circuit before reissuing expensive or repeated
  external mutations
- Validate external IDs before mutating third-party state

#### Date and lookup handling

- If a helper now throws on error, every caller must catch it or return
  a safe default
- If date-only matching round-trips through a `Date`, verify every input
  source preserves the same calendar day across time zones

#### Connection discovery and failover

- Auto-recovery writes should respect manual-mode or user-managed
  configurations
- Tests cover the opt-out or manual-mode skip path
- Any newly introduced connection metadata is either consumed
  intentionally or safely ignored

#### API endpoints

- New routes use the correct API namespace and framework conventions
- User input is validated at the boundary
- User-controlled path, host, header, or query data is sanitized before
  interpolation into logs or URLs
- Avoid request-building helpers in error paths that can reintroduce SSRF
  or unsafe URL construction issues

#### Security checklist (OWASP top 10)

- No new SQL built by string concatenation — all queries go through
  TypeORM repositories or `QueryBuilder` with parameters
- No `exec`/`spawn` of a shell with user input
- No new `fs` reads where the path is derived from request input
  without `path.resolve` + allow-list check
- No secrets (tokens, api keys) in log messages — run
  `git diff <lastTag>..HEAD | grep -iE "(api[_-]?key|token|secret|password)"`
  and audit each hit
- New external HTTP calls should go through the shared client or wrapper
  that enforces timeouts, retries, and sanitized failure logging

### 4. Verify, don't assume

Before writing any finding:

- Read the surrounding `try/catch` to confirm a throw actually escapes
- Search for every caller of a changed function signature
- Check `git blame -L <start>,<end> <file>` for the context of the line
  you're about to flag
- If the finding is "X removed a null-check", verify the function
  being called no longer returns null

### 5. Run the suites

Run the relevant build, test, and typecheck suites for the changed
areas, plus at least one full-project validation command if the release
scope is broad.

A green build and test run is necessary but not sufficient — tests only
catch regressions that someone thought to write a test for.

### 6. Write the report

Use severity levels, in this order:

- **CRITICAL** — data loss, auth bypass, remote code execution, broken
  migration. Must fix before tagging.
- **HIGH** — observable user-facing regression, silent failure mode,
  real security exposure. Should fix before tagging.
- **MEDIUM** — performance regression, log quality, inconsistent
  behavior. Fix in a follow-up.
- **LOW** — code hygiene, dead code, defense-in-depth. Nice-to-have.

Every finding must include:

- Full file path as a markdown link
- Exact line range of the problem
- What specifically breaks (one sentence)
- A concrete fix (code snippet or clear instruction)
- Why this is not already covered by the change's stated intent — if you
  cannot answer this, the finding probably is not real

### 7. When in doubt

Do not flag something as "may race", "could leak", or "potentially
unsafe" without reproducing it or pointing at a specific sequence that
triggers it. Speculative findings burn reviewer goodwill and make the
real findings harder to notice.

If a change looks wrong but the PR body says it's deliberate, write
the finding as a **question** to the author instead of an assertion,
or skip it entirely.
