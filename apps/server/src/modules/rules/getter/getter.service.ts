import {
  MediaItem,
  MediaItemType,
  MediaServerType,
  RuleValueType,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { Application } from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RulesDto } from '../dtos/rules.dto';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { EmbyGetterService } from './emby-getter.service';
import { JellyfinGetterService } from './jellyfin-getter.service';
import { PlexGetterService } from './plex-getter.service';
import { RadarrGetterService } from './radarr-getter.service';
import { SeerrGetterService } from './seerr-getter.service';
import { SonarrGetterService } from './sonarr-getter.service';
import { StreamystatsGetterService } from './streamystats-getter.service';
import { TautulliGetterService } from './tautulli-getter.service';

@Injectable()
export class ValueGetterService {
  constructor(
    private readonly plexGetter: PlexGetterService,
    private readonly radarrGetter: RadarrGetterService,
    private readonly sonarrGetter: SonarrGetterService,
    private readonly seerrGetter: SeerrGetterService,
    private readonly tautulliGetter: TautulliGetterService,
    private readonly streamystatsGetter: StreamystatsGetterService,
    private readonly jellyfinGetter: JellyfinGetterService,
    private readonly embyGetter: EmbyGetterService,
    private readonly mediaServerFactory: MediaServerFactory,
  ) {}

  async get(
    [val1, val2]: [number, number],
    libItem: MediaItem,
    ruleGroup?: RulesDto,
    dataType?: MediaItemType,
    currentRule?: RuleDto,
    arrLookupCache?: ArrLookupCache,
  ): Promise<RuleValueType> {
    switch (val1) {
      // Route Plex/Jellyfin/Emby Application IDs to the configured media
      // server's getter. This handles community rules that reference the
      // "wrong" server type - e.g. a rule authored with Application.JELLYFIN
      // can still evaluate against a configured Emby server.
      case Application.PLEX:
      case Application.JELLYFIN:
      case Application.EMBY: {
        const serverType =
          await this.mediaServerFactory.getConfiguredServerType();

        const getter =
          serverType === MediaServerType.JELLYFIN
            ? this.jellyfinGetter
            : serverType === MediaServerType.PLEX
              ? this.plexGetter
              : serverType === MediaServerType.EMBY
                ? this.embyGetter
                : null;

        return getter?.get(val2, libItem, dataType, ruleGroup) ?? null;
      }
      case Application.RADARR: {
        return await this.radarrGetter.get(
          val2,
          libItem,
          ruleGroup,
          currentRule,
          arrLookupCache,
        );
      }
      case Application.SONARR: {
        return await this.sonarrGetter.get(
          val2,
          libItem,
          dataType,
          ruleGroup,
          currentRule,
          arrLookupCache,
        );
      }
      case Application.SEERR: {
        return await this.seerrGetter.get(val2, libItem, dataType);
      }
      case Application.TAUTULLI: {
        return await this.tautulliGetter.get(
          val2,
          libItem,
          dataType,
          ruleGroup,
        );
      }
      case Application.STREAMYSTATS: {
        return await this.streamystatsGetter.get(val2, libItem);
      }
      default: {
        return null;
      }
    }
  }
}
