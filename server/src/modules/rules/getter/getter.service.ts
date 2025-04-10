import { Injectable } from '@nestjs/common';
import { PlexLibraryItem } from '../../../modules/api/plex-api/interfaces/library.interfaces';
import { Application, RuleValueType } from '../constants/rules.constants';
import { OverseerrGetterService } from './overseerr-getter.service';
import { PlexGetterService } from './plex-getter.service';
import { RadarrGetterService } from './radarr-getter.service';
import { SonarrGetterService } from './sonarr-getter.service';
import { RulesDto } from '../dtos/rules.dto';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';
import { TautulliGetterService } from './tautulli-getter.service';
import { JellyseerrGetterService } from './jellyseerr-getter.service';

@Injectable()
export class ValueGetterService {
  constructor(
    private readonly plexGetter: PlexGetterService,
    private readonly radarrGetter: RadarrGetterService,
    private readonly sonarrGetter: SonarrGetterService,
    private readonly overseerGetter: OverseerrGetterService,
    private readonly tautulliGetter: TautulliGetterService,
    private readonly jellyseerrGetter: JellyseerrGetterService,
  ) {}

  async get(
    [val1, val2]: [number, number],
    libItem: PlexLibraryItem,
    ruleGroup?: RulesDto,
    dataType?: EPlexDataType,
  ): Promise<RuleValueType> {
    switch (val1) {
      case Application.PLEX: {
        return await this.plexGetter.get(val2, libItem, dataType, ruleGroup);
      }
      case Application.RADARR: {
        return await this.radarrGetter.get(val2, libItem, ruleGroup);
      }
      case Application.SONARR: {
        return await this.sonarrGetter.get(val2, libItem, dataType, ruleGroup);
      }
      case Application.OVERSEERR: {
        return await this.overseerGetter.get(val2, libItem, dataType);
      }
      case Application.TAUTULLI: {
        return await this.tautulliGetter.get(
          val2,
          libItem,
          dataType,
          ruleGroup,
        );
      }
      case Application.JELLYSEERR: {
        return await this.jellyseerrGetter.get(val2, libItem, dataType);
      }
      default: {
        return null;
      }
    }
  }
}
