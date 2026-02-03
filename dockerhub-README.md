<p align="center">
  <img src="https://github.com/maintainerr/maintainerr/blob/main/apps/ui/public/logo.png?raw=true" alt="Maintainerr's logo"/>
</p>

<p align="center" >
<!-- Latest Build -->  <picture><img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/maintainerr/maintainerr/.github%2Fworkflows%2Fbuild.yml?branch=main&style=flat&logo=github&label=Latest%20Build"></picture>
<!-- Latest Release -->  <a href="https://github.com/maintainerr/Maintainerr/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/maintainerr/maintainerr?style=flat&logo=github&logoColor=white&label=Latest%20Release"></a>
<!-- Commits -->  <picture><img alt="GitHub commits since latest release" src="https://img.shields.io/github/commits-since/maintainerr/maintainerr/latest?style=flat&logo=github&logoColor=white"></picture>
<!-- Github Stars -->  <picture><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/maintainerr/maintainerr?style=flat&logo=github&logoColor=white&label=Stars"></picture>
<!-- Docker Pulls -->  <a href="https://hub.docker.com/r/maintainerr/maintainerr"><img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/maintainerr/maintainerr?style=flat&logo=docker&logoColor=white&label=Docker%20Pulls"></a>
<!-- Issues Closed -->  <picture><img alt="GitHub Issues or Pull Requests" src="https://img.shields.io/github/issues-closed/maintainerr/maintainerr?style=flat&logo=github&logoColor=white"></picture>
<!-- Issues Open -->  <picture><img alt="GitHub Issues or Pull Requests" src="https://img.shields.io/github/issues/maintainerr/maintainerr?style=flat&logo=github&logoColor=white"></picture>
<!-- Open Collective Donate -->  <a href="https://opencollective.com/maintainerr"><img alt="Static Badge" src="https://img.shields.io/badge/DONATE-opencollective-red?style=flat&logo=opencollective&logoColor=white"></a>
<!-- License -->  <picture><img alt="GitHub License" src="https://img.shields.io/github/license/maintainerr/maintainerr?style=flat"></picture>
</p>

<b>Maintainerr</b> makes managing your media easy.

- Do you hate being the janitor of your server?
- Do you have a lot of media that never gets watched?
- Do your users constantly request media, and let it sit there afterward never to be touched again?

If you answered yes to any of those questions... You NEED <b>Maintainerr</b>.
It's a one-stop-shop for handling those outlying shows and movies that take up precious space on your server.

# Documentation

[For more information, please consult the documentation](https://docs.maintainerr.info/)

# Support

<a href="https://discord.maintainerr.info"><img alt="Discord" src="https://img.shields.io/discord/1152219249549512724?style=flat&logo=discord&logoColor=white&label=Discord&color=orange"></a>

<a href="https://github.com/maintainerr/maintainerr"><img alt="Github" src="https://img.shields.io/github/stars/maintainerr?style=flat&logo=github&label=Github&color=orange&link=https%3A%2F%2Fgithub.com%2Fmaintainerr%2Fmaintainerr"></a>

# Installation

Data is saved within the container under /opt/data, it is recommended to tie a persistent volume to this location in your docker run command/compose file.
Make sure this directory is read/writeable by the user specified in the 'user' instruction. If no 'user' instruction is configured, the volume should be accessible by UID:GID 1000:1000.

For more information, visit the [installation guide](https://docs.maintainerr.info/latest/Installation).

Docker run:

```yaml
docker run -d \
--name maintainerr \
-e TZ=Europe/Brussels \
-v ./data:/opt/data \
-u 1000:1000 \
-p 6246:6246 \
--restart unless-stopped \
maintainerr/maintainerr:latest
```

Docker-compose:

```yaml
version: '3'

services:
    maintainerr:
        image: maintainerr/maintainerr:latest # or ghcr.io/maintainerr/maintainerr:latest
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
```

# Docker Tags

| Tag | Description |
|----|--------|
| latest | Stable Release (*recommended*) |
| main | Dev Version |

# Environment Variables

A list of all available environment variables are below. No other env variables are officially supported by Maintainerr. These are added either into the compose file or your docker run command.

| Variable | Default Value | Description |
|----------|-------|----------|
| TZ | *host timezone* | Controls date formatting in logs. |
| UI_HOSTNAME | 0.0.0.0 | The listen host of the web server. Can be set to :: for IPv6. |
| UI_PORT | 6246 | The listen port of the web server. |
| BASE_PATH | (*none*) | If reverse proxying with a subfolder you'll want to set this. Must be in the format of `/subfolder` |
| GITHUB_TOKEN | (*none*) | GitHub Personal Access Token for higher API rate limits |

# Features

- Configure rules specific to your needs, based on several available options from Plex, Overseerr, Jellyseerr, Radarr, Sonarr and Tautulli.
- Manually add media to a collection, in case it's not included after rule execution. (one-off items that don't match a rule set)
- Selectively exclude media from being added to a collection, even if it matches a rule.
- Show a collection, containing rule matched media, on the Plex home screen for a specific duration before deletion. Think "Leaving soon".
- Optionally, use a manual Plex collection, in case you don't want <b>Maintainerr</b> to add & remove Plex collections at will.
- Manage media straight from the collection within Plex. <b>Maintainerr</b> will sync and add or exclude media to/from the internal collection.
- Remove or unmonitor media from \*arr
- Clear requests from Overseerr
- Delete files from disk

<br />
Currently, <b>Maintainerr</b> supports rule parameters from these apps :

- Plex
- Overseerr
- Jellyseerr
- Radarr
- Sonarr
- Tautulli

# Preview

<p align="center">
  <img src="https://github.com/maintainerr/maintainerr/blob/main/apps/ui/public/screenshots/collections_screenshot.png?raw=true" alt="Maintainerr's overview"/>
</p>
