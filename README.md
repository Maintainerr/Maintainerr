<p align="center">
  <img src="ui/public/logo_black.svg?raw=true" alt="Sublime's custom image"/>
</p>

<div align="center">

![Build Status](https://ci.cyntek.be/buildStatus/icon?job=Maintainerr%2FMaintainerr-dev-build)

[![](https://dcbadge.vercel.app/api/server/WP4ZW2QYwk)](https://discord.gg/WP4ZW2QYwk)

</div>

<b>Maintainerr</b> makes managing your media easy. Create custom rules with parameters across different services, show matching media on the Plex home screen for a given amount of days and handle the deletion.

# Features
- Configure rules specific to your needs
- Manually add media to a collection, in case it's not included in your rules
- Exclude  media for some or all rules
- Show a plex collection, containing selected media, on the Plex home screen for a specific duration
- Remove or unmonitor media from Radarr
- Remove or unmonitor media from Sonarr
- Clear requests from Overseerr
- Delete files from disk

Currently, Maintainerr supports rules across these apps :

- Plex
- Overseerr
- Radarr
- Sonarr

# Installation

Docker images for amd64, arm64 & armv7 are available under jorenn92/maintainerr. <br />
Data is saved under /opt/data, a volume should be created to make the configuration persistent.

For more information visit the [installation guide](docs/2-getting-started/1-installation/Installation.md) or navigate to \<maintainerr_url\>:\<port\>/docs after starting your Maintainerr container.

Docker-compose: 
```Yaml
version: '3'

services:
  maintainerr:
    image: jorenn92/maintainerr:latest
    container_name: maintainerr
    volumes:
      - ./data:/opt/data
    environment:
      - TZ=Europe/Brussels
    ports:
      - 8154:80
    restart: unless-stopped
```

# Credits
Maintainerr is heavily inspired by Overseerr. Some parts of Maintainerr's code are plain copies. Big thanks to the Overseerr team for creating and maintaining such an amazing app!

Please support them at https://github.com/sct/overseerr
