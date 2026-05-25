# Agent instruction wiring

How this repo's AI coding agents (Claude, GitHub Copilot, Cursor, Codex) load
their instructions. Each agent **auto-loads a different entrypoint**, but they
all converge on **`AGENTS.md`** as the single documentation index, and each
entrypoint *also names the two standing rules directly* so they can't be missed.

This file is the single source for the wiring; `AGENTS.md` links here.

```
CLAUDE
  auto-loads → .claude/rules/implementation.md
       ├─→ AGENTS.md ........................ (doc index)
       │      ├─→ implementation.instructions.md   [standing]
       │      ├─→ project-notes.instructions.md    [standing]
       │      ├─→ release-review.instructions.md    [task-specific]
       │      └─→ ARCHITECTURE.md                   [task-specific]
       └─→ implementation.instructions.md  +  project-notes.instructions.md
              (named directly → read before any code, can't be missed)
  also: SessionStart hook injects AGENTS.md (belt-and-suspenders)

COPILOT
  auto-loads → .github/copilot-instructions.md
       ├─→ AGENTS.md → (same index as above)
       └─→ implementation.instructions.md  +  project-notes.instructions.md  (named)
  also auto-applies via applyTo:"**" → implementation.instructions.md, project-notes.instructions.md
       release-review → applyTo scoped to CHANGELOGs/release workflows (not every file)

CURSOR
  auto-loads → .cursor/rules/project.mdc  (alwaysApply: true)
       ├─→ AGENTS.md → (same index as above)
       └─→ implementation.instructions.md  +  project-notes.instructions.md  (named)

CODEX
  auto-loads → AGENTS.md  (the index itself)
       ├─→ implementation.instructions.md   [standing]
       ├─→ project-notes.instructions.md    [standing]
       ├─→ release-review.instructions.md    [task-specific]
       └─→ ARCHITECTURE.md                   [task-specific]


all four entrypoints ──────────────→ AGENTS.md  (single doc index)
project-notes.instructions.md ──→ ARCHITECTURE.md, AGENTS.md   ✓
implementation.instructions.md ─→ ARCHITECTURE.md              ✓
```

## Rules of the structure (keep it working)

- **`AGENTS.md` is the single index.** Add any new doc to its "Documentation map".
- **Standing rules** (read before any code): `implementation.instructions.md` and
  `project-notes.instructions.md` — `applyTo: "**"` and named in every entrypoint.
- **Task-specific** (read on demand, not every session): `release-review.instructions.md`
  (Copilot `applyTo` scoped to release artifacts) and `ARCHITECTURE.md`.
- **Each agent entrypoint is a thin router** to `AGENTS.md` + the two standing rules.
  When you change the wiring, update all four entrypoints together:
  `.claude/rules/implementation.md`, `.github/copilot-instructions.md`,
  `.cursor/rules/project.mdc`, and `AGENTS.md`.
