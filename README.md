<p align="center">
  <img src="apps/ui/public/logo_black.svg?raw=true" alt="Maintainerr's custom image"/>
</p>

<p align="center"><i>Founded in 2021 - real human work, before mainstream AI.</i></p>

<p align="center" >
<!-- Discord Badge -->  <a href="https://discord.maintainerr.info"><img alt="Discord" src="https://img.shields.io/discord/1152219249549512724?style=flat&logo=discord&logoColor=white&label=Maintainerr"></a>
<!-- Latest Build -->  <picture><img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/maintainerr/maintainerr/.github%2Fworkflows%2Fbuild_dev.yml?branch=development&style=flat&logo=github&label=Latest%20Build"></picture>
<!-- Latest Release -->  <a href="https://github.com/maintainerr/Maintainerr/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/maintainerr/maintainerr?style=flat&logo=github&logoColor=white&label=Latest%20Release"></a>
<!-- Commits -->  <picture><img alt="GitHub commits since latest release" src="https://img.shields.io/github/commits-since/maintainerr/maintainerr/latest?style=flat&logo=github&logoColor=white"></picture>
<!-- Github Stars -->  <picture><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/maintainerr/maintainerr?style=flat&logo=github&logoColor=white&label=Stars"></picture>
<!-- Docker Pulls -->  <a href="https://hub.docker.com/r/maintainerr/maintainerr"><img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/maintainerr/maintainerr?style=flat&logo=docker&logoColor=white&label=Docker%20Pulls"></a>
<!--Commits per month -->  <picture><img alt="GitHub commit activity" src="https://img.shields.io/github/commit-activity/m/maintainerr/maintainerr?style=flat&logo=github&logoColor=white&label=COMMITS"></picture>
<!-- Issues Closed -->  <picture><img alt="GitHub Issues or Pull Requests" src="https://img.shields.io/github/issues-closed/maintainerr/maintainerr?style=flat&logo=github&logoColor=white"></picture>
<!-- Issues Open -->  <picture><img alt="GitHub Issues or Pull Requests" src="https://img.shields.io/github/issues/maintainerr/maintainerr?style=flat&logo=github&logoColor=white"></picture>
<!-- Open Collective Donate -->  <a href="https://opencollective.com/maintainerr"><img alt="Static Badge" src="https://img.shields.io/badge/DONATE-opencollective-red?style=flat&logo=opencollective&logoColor=white"></a>
<!-- Docs -->  <a href="https://docs.maintainerr.info"><img alt="Documentation" src="https://img.shields.io/badge/Material_for_MkDocs-%3A)-blue?style=flat&logo=materialformkdocs&logoColor=white"></a>
<!-- License -->  <picture><img alt="GitHub License" src="https://img.shields.io/github/license/maintainerr/maintainerr?style=flat"></picture>
</p>

<b>Maintainerr</b> is the janitor your media server doesn't have.

Libraries fill up. Users request a movie, watch it once, and never touch it again. Half-finished shows sit around for years. And somehow you're the one who has to decide what to delete.

Maintainerr does the deciding for you. Write rules for the stuff that's just taking up space - unwatched, unrequested, gathering dust - and it gathers those titles into a collection, gives everyone a grace period to catch up, then clears them from your media server, the \*arrs and Seerr. **Set it up once and forget it. Everything is automated!**

# Installation

Docker images for amd64 & arm64 are available from:

[![GHCR](https://img.shields.io/badge/GHCR-Recommended-78350f?style=for-the-badge&logo=github&logoColor=white)](https://ghcr.io/maintainerr/maintainerr)

[![Docker Hub](https://img.shields.io/badge/Docker_Hub-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://hub.docker.com/r/maintainerr/maintainerr)

> **Data directory.** Maintainerr stores its data at `/opt/data` inside the container. Mount a persistent volume there in your `docker run` command or Compose file. The directory must be readable and writable by the configured `user`; if no `user` is set, make it accessible to UID:GID `1000:1000`.

> If you set `BASE_PATH`, add it to the start of the paths too (e.g. `/maintainerr/api/health/ready`).

For more information, visit the [installation guide](https://docs.maintainerr.info/installation).

<details>
<summary><b>Docker run</b></summary>

```Yaml
docker run -d \
--name maintainerr \
-e TZ=Europe/Brussels \
-v ./data:/opt/data \
-u 1000:1000 \
-p 6246:6246 \
--restart unless-stopped \
ghcr.io/maintainerr/maintainerr:latest
```

</details>

<details>
<summary><b>Docker Compose</b></summary>

```Yaml
services:
    maintainerr:
        image: ghcr.io/maintainerr/maintainerr:latest # or ghcr.io/maintainerr/maintainerr:development (to test unreleased changes)
        container_name: maintainerr
        user: 1000:1000
        volumes:
          - type: bind
            source: ./data
            target: /opt/data
        environment:
          - TZ=Europe/Brussels
#      - BASE_PATH=/maintainerr # uncomment if you're serving maintainerr from a subdirectory
#      - UI_HOSTNAME=:: # uncomment if you want to listen on IPv6 instead (default 0.0.0.0)
#      - UI_PORT=6247 # uncomment to change the UI port (default 6246)
#      - GITHUB_TOKEN=ghp_yourtoken # Optional: GitHub Personal Access Token for higher API rate limits (60/hr without, 5000/hr with token)
        ports:
          - 6246:6246
        restart: unless-stopped
        healthcheck: # already baked into the image; included here so you can tune it
          test: ['CMD', '/opt/app/healthcheck.sh']
          interval: 30s
          timeout: 5s
          start_period: 40s
          retries: 3
```

</details>

<details>
<summary><b>Kubernetes (Deployment + Service)</b></summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: maintainerr
spec:
  replicas: 1
  selector:
    matchLabels:
      app: maintainerr
  template:
    metadata:
      labels:
        app: maintainerr
    spec:
      securityContext:
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
      containers:
        - name: maintainerr
          image: ghcr.io/maintainerr/maintainerr:latest
          ports:
            - containerPort: 6246
          env:
            - name: TZ
              value: Europe/Brussels
            # - name: BASE_PATH      # if serving from a subdirectory
            #   value: /maintainerr
          volumeMounts:
            - name: data
              mountPath: /opt/data
          livenessProbe:
            httpGet:
              path: /api/health/live
              port: 6246
            initialDelaySeconds: 30
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /api/health/ready
              port: 6246
            initialDelaySeconds: 10
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: maintainerr-data
---
apiVersion: v1
kind: Service
metadata:
  name: maintainerr
spec:
  selector:
    app: maintainerr
  ports:
    - port: 6246
      targetPort: 6246
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: maintainerr-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
```

</details>

# Features

- Build rules from properties across Plex, Jellyfin, Emby, Radarr, Sonarr, Seerr, Tautulli and Streamystats, combined with AND/OR logic.
- Use Plex, Jellyfin or Emby as your media server, and switch between them with rule migration.
- Run several media servers at once - one Maintainerr instance per server, each with its own rules, collections and data.
- Smart metadata matching - resolves every item across your media server, the \*arrs and Seerr by external IDs (IMDB/TMDB/TVDB), bridges missing IDs, and sanity-checks each match by release year so the right title is acted on.
- Bring your own TVDB key for a second metadata source alongside the built-in TMDB - Maintainerr cross-checks IDs and years between providers and fills the gaps from whichever has the data.
- Collect rule-matched media into a Maintainerr collection that is held for a configurable period before action - optionally pinned to the Plex home screen as a "Leaving soon" shelf.
- Run automatic collections, or manual ones you manage; add or exclude individual items even when they match a rule.
- Delete items from your download client.
- Manage collection membership from within your media server - Maintainerr syncs manual changes back.
- On handling: delete files from disk, unmonitor or delete in Radarr/Sonarr, change quality profile, and clear requests in Seerr.
- Render configurable overlays (text, countdown, shapes, images) onto posters and title cards on your media server(s).
- Set a custom collection poster that survives recreation.
- Send notifications via Discord, Slack, Telegram, Pushover, Gotify, ntfy, Pushbullet, LunaSea, email or webhook.
- Share rules through YAML import/export, the community rule library, and cross-server migration.
- Schedule rule and collection runs with cron and watch progress live.
- Plus storage metrics, a calendar, logs, an OpenAPI/Swagger API, health endpoints, and subfolder (`BASE_PATH`) hosting.
- and more...

<br />

Maintainerr builds rules from data across these apps:

[![Plex](https://img.shields.io/badge/Plex-E5A00D?style=for-the-badge&logo=plex&logoColor=white)](https://www.plex.tv/)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-00A4DC?style=for-the-badge&logo=jellyfin&logoColor=white)](https://jellyfin.org/)
[![Emby](https://img.shields.io/badge/Emby-52B54B?style=for-the-badge&logo=emby&logoColor=white)](https://emby.media/)
[![Seerr](https://img.shields.io/badge/Seerr-5969F8?style=for-the-badge)](https://seerr.dev/)
[![Radarr](https://img.shields.io/badge/Radarr-FFC230?style=for-the-badge&logo=radarr&logoColor=white)](https://radarr.video/)
[![Sonarr](https://img.shields.io/badge/Sonarr-2596BE?style=for-the-badge&logo=sonarr&logoColor=white)](https://sonarr.tv/)
[![Tautulli](https://img.shields.io/badge/Tautulli-DBA81A?style=for-the-badge)](https://tautulli.com/)
[![Streamystats](https://img.shields.io/badge/Streamystats-8A4FBE?style=for-the-badge)](https://github.com/fredrikburmester/streamystats)

<sub>Tautulli is Plex-only; Streamystats is Jellyfin-only.</sub>

# API

Each instance serves interactive Swagger / OpenAPI docs at `/api/swagger` (prefixed with `BASE_PATH` when set). For everything else, see the [documentation](#documentation).

Compatibility:

- Since Maintainerr v3.0.0, `/api/media-server` is the canonical API for media-server operations.
- `/api/collections` and other app-specific endpoints are internal application APIs and are not a backward-compatible Plex contract.

# Preview

<table>
  <tr>
    <td width="50%"><img width="100%" src="https://raw.githubusercontent.com/Maintainerr/maintainerr_site/main/src/assets/screenshots/Collections.png" alt="Collections" /></td>
    <td width="50%"><img width="100%" src="https://raw.githubusercontent.com/Maintainerr/maintainerr_site/main/src/assets/screenshots/Rules.png" alt="Rules" /></td>
  </tr>
  <tr>
    <td width="50%"><img width="100%" src="https://raw.githubusercontent.com/Maintainerr/maintainerr_site/main/src/assets/screenshots/Ruleconfig.png" alt="Rule configuration" /></td>
    <td width="50%"><img width="100%" src="https://raw.githubusercontent.com/Maintainerr/maintainerr_site/main/src/assets/screenshots/Overlays.png" alt="Overlays" /></td>
  </tr>
  <tr>
    <td width="50%"><img width="100%" src="https://raw.githubusercontent.com/Maintainerr/maintainerr_site/main/src/assets/screenshots/Calendar.png" alt="Calendar" /></td>
    <td width="50%"><img width="100%" src="https://raw.githubusercontent.com/Maintainerr/maintainerr_site/main/src/assets/screenshots/StorageMetrics.png" alt="Storage metrics" /></td>
  </tr>
</table>

# Health endpoints

Maintainerr serves health probes under `/api/health` (prefixed with `BASE_PATH` when set): `/live` (process only), `/ready` (also checks the database, returns `503` if it's unreachable), and `/api/health` (alias of `/ready`). The Docker image already ships a `HEALTHCHECK` against `/api/health/ready`, and the Kubernetes example above wires the liveness and readiness probes.

[See the documentation for response shapes and full details.](https://docs.maintainerr.info/)

# Documentation

Want the full picture? Every feature, setting, and gotcha, documented in detail:

[![Documentation](https://img.shields.io/badge/Documentation-78350f?style=for-the-badge&logo=materialformkdocs&logoColor=white)](https://docs.maintainerr.info/)

# Feature requests

Missing something, or want to back an idea?

[![Vote on features](https://img.shields.io/badge/Vote_on_features-78350f?style=for-the-badge)](https://features.maintainerr.info/?view=most-wanted)

# Contributing

Maintainerr is community-driven, and we're always looking for more hands. You don't have to be a developer:

- Code - pick up an open issue or feature request, or bring your own idea.
- Bugs - report them, or even better, send a fix.
- Support - answer questions and help others on Discord.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then dive into the [issues](https://github.com/Maintainerr/Maintainerr/issues) or our [Discord](https://discord.maintainerr.info). New contributors are genuinely welcome.

# Support us

Maintainerr is free and open source. We cover the server costs ourselves and spend countless hours keeping it stable, adding features, and fixing issues. If it saves you time, chipping in keeps it going - and is hugely appreciated.

[![Donate](https://img.shields.io/badge/Donate-Open_Collective-78350f?style=for-the-badge&logo=opencollective&logoColor=white)](https://opencollective.com/maintainerr)

# Credits

Maintainerr is built and maintained by:

- [@jorenn92](https://github.com/jorenn92) - founder & original author
- [@ydkmlt84](https://github.com/ydkmlt84) - code owner
- [@benscobie](https://github.com/benscobie) - core developer (2024-2026)
- [@enoch85](https://github.com/enoch85) - code owner & current maintainer
- [@SmolSoftBoi](https://github.com/SmolSoftBoi) - core contributor

The overlay system was built by [@gssariev](https://github.com/gssariev), with [@MrLinford](https://github.com/MrLinford), [@SmolSoftBoi](https://github.com/SmolSoftBoi) and [@Simon-Eklundh](https://github.com/Simon-Eklundh).

...and everyone else in the community who has contributed (auto-updated):

<a href="https://github.com/Maintainerr/Maintainerr/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Maintainerr/Maintainerr" alt="Maintainerr contributors" />
</a>

<sub>Made with [contrib.rocks](https://contrib.rocks).</sub>

Maintainerr is heavily inspired by Seerr (Overseerr / Jellyseerr). Some parts of Maintainerr's code are direct copies. Big thanks to the Seerr team!
