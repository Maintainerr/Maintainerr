import {
  MediaItem,
  MediaItemType,
  MediaServerType,
  RuleValueType,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { Application } from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';
import { JellyfinGetterService } from './jellyfin-getter.service';
import { PlexGetterService } from './plex-getter.service';
import { RadarrGetterService } from './radarr-getter.service';
import { SeerrGetterService } from './seerr-getter.service';
import { SonarrGetterService } from './sonarr-getter.service';
import { TautulliGetterService } from './tautulli-getter.service';

@Injectable()
export class ValueGetterService {
  constructor(
    private readonly plexGetter: PlexGetterService,
    private readonly radarrGetter: RadarrGetterService,
    private readonly sonarrGetter: SonarrGetterService,
    private readonly seerrGetter: SeerrGetterService,
    private readonly tautulliGetter: TautulliGetterService,
    private readonly jellyfinGetter: JellyfinGetterService,
    private readonly mediaServerFactory: MediaServerFactory,
  ) {}

  async get(
    [val1, val2]: [number, number],
    libItem: MediaItem,
    ruleGroup?: RulesDto,
    dataType?: MediaItemType,
  ): Promise<RuleValueType> {
    switch (val1) {
      // Route both PLEX and JELLYFIN to the configured media server's getter
      // This handles community rules that may reference the wrong server type
      case Application.PLEX:
      case Application.JELLYFIN: {
        const serverType =
          await this.mediaServerFactory.getConfiguredServerType();

        const getter =
          serverType === MediaServerType.JELLYFIN
            ? this.jellyfinGetter
            : serverType === MediaServerType.PLEX
              ? this.plexGetter
              : null;

        return getter?.get(val2, libItem, dataType, ruleGroup) ?? null;
      }
      case Application.RADARR: {
        return await this.radarrGetter.get(val2, libItem, ruleGroup);
      }
      case Application.SONARR: {
        return await this.sonarrGetter.get(val2, libItem, dataType, ruleGroup);
      }
      case Application.SEERR: {
        return await this.seerrGetter.get(val2, libItem, dataType);
      }
      case Application.TAUTULLI: {
        return await this.tautulliGetter.get(val2, libItem, dataType);
      }
      default: {
        return null;
      }
    }
  }
}
