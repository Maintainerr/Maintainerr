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

## General

When implementing against any external API or SDK (Plex, Jellyfin, TypeORM, etc.), read the official API documentation to confirm behaviour. Do not guess or assume - facts only, based on current documentation.

### Workspace MCP servers

- Workspace MCP config lives in `.vscode/mcp.json` (VS Code), `.mcp.json` (Claude Code), and `.codex/config.toml` (Codex). Keep all three in sync.
- `github` MCP: read-only - use for live GitHub context, never for writes.
- `playwright` MCP: use for browser-driven UI validation. **Screenshots must be saved as `filename: ".playwright-mcp/<name>.png"`** - bare filenames land at the repo root (the `--output-dir` flag doesn't apply to explicit filenames).
- **Browser:** the MCP uses the **system Chromium baked into the devbox image** (`/usr/bin/chromium`, via `--executable-path` + `--no-sandbox` because the container runs as root). It does **not** download a browser per-session - the per-session CDN download is blocked by the IPv4-only egress firewall (the CDN redirects to IPv6 hosts with no route). If `/usr/bin/chromium` is missing, the devbox image needs rebuilding (it's installed in `infra/Dockerfile.agents`).
- **These stdio MCP servers only load when your AI client (VS Code, Claude Code, or Codex) is launched from inside devbox at `/workspace`** - `npx` (the server command) is only on PATH in the container, and the client must start at the repo root to pick up its mcp config. Launched on the bare host or from another directory, the `playwright`/`github` servers never register. Reload the editor / restart the client session after editing any mcp config.

### API documentation references

#### Media management services

- Sonarr: https://raw.githubusercontent.com/Sonarr/Sonarr/develop/src/Sonarr.Api.V3/openapi.json
- Radarr: https://raw.githubusercontent.com/Radarr/Radarr/develop/src/Radarr.Api.V3/openapi.json
- Tautulli: https://docs.tautulli.com/extending-tautulli/api-reference

#### Request management services

- Seerr: https://docs.seerr.dev/

#### Media server services

- Plex (python-plexapi): https://python-plexapi.readthedocs.io/en/latest/index.html
- Plex (OpenAPI): https://raw.githubusercontent.com/LukeHagar/plex-api-spec/refs/heads/main/src/pms-spec.yaml
- Jellyfin: https://api.jellyfin.org/

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
