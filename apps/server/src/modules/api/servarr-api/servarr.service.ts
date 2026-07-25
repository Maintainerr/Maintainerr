import { Injectable } from '@nestjs/common';
import { SettingsDataService } from '../../../modules/settings/settings-data.service';
import { MaintainerrLoggerFactory } from '../../logging/logs.service';
import { RadarrSettingRawDto } from "../../settings/dto's/radarr-setting.dto";
import { SonarrSettingRawDto } from "../../settings/dto's/sonarr-setting.dto";
import { SportarrSettingRawDto } from "../../settings/dto's/sportarr-setting.dto";
import cacheManager from '../lib/cache';
import { RadarrApi } from './helpers/radarr.helper';
import { SonarrApi } from './helpers/sonarr.helper';
import { SportarrApi } from './helpers/sportarr.helper';

@Injectable()
export class ServarrService {
  SonarrApi: SonarrApi;
  private radarrApiCache: Record<string, RadarrApi> = {};
  private sonarrApiCache: Record<string, SonarrApi> = {};
  private sportarrApiCache: Record<string, SportarrApi> = {};

  constructor(
    private readonly settings: SettingsDataService,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {}

  public async getSonarrApiClient(id: number | SonarrSettingRawDto) {
    if (typeof id === 'object') {
      return new SonarrApi(
        {
          url: `${id.url}/api/v3/`,
          apiKey: `${id.apiKey}`,
        },
        this.loggerFactory.createLogger(),
      );
    } else {
      if (!this.sonarrApiCache[id]) {
        const setting = await this.settings.getSonarrSetting(id);

        if (setting == null || !('id' in setting)) {
          throw new Error('Sonarr setting not found');
        }

        const cacheKey = `sonarr-${id}`;
        if (!cacheManager.getCache(cacheKey)) {
          cacheManager.createCache(cacheKey, `Sonarr-${id}`, 'sonarr');
        }

        this.sonarrApiCache[id] = new SonarrApi(
          {
            url: `${setting.url}/api/v3/`,
            apiKey: `${setting.apiKey}`,
            cacheName: cacheKey,
          },
          this.loggerFactory.createLogger(),
        );
      }

      return this.sonarrApiCache[id];
    }
  }

  public async getRadarrApiClient(id: number | RadarrSettingRawDto) {
    if (typeof id === 'object') {
      return new RadarrApi(
        {
          url: `${id.url}/api/v3/`,
          apiKey: `${id.apiKey}`,
        },
        this.loggerFactory.createLogger(),
      );
    } else {
      if (!this.radarrApiCache[id]) {
        const setting = await this.settings.getRadarrSetting(id);

        if (setting == null || !('id' in setting)) {
          throw new Error('Radarr setting not found');
        }

        const cacheKey = `radarr-${id}`;
        if (!cacheManager.getCache(cacheKey)) {
          cacheManager.createCache(cacheKey, `Radarr-${id}`, 'radarr');
        }

        this.radarrApiCache[id] = new RadarrApi(
          {
            url: `${setting.url}/api/v3/`,
            apiKey: `${setting.apiKey}`,
            cacheName: cacheKey,
          },
          this.loggerFactory.createLogger(),
        );
      }

      return this.radarrApiCache[id];
    }
  }

  public deleteCachedRadarrApiClient(id: number) {
    if (this.radarrApiCache[id]) {
      delete this.radarrApiCache[id];
    }
  }

  public deleteCachedSonarrApiClient(id: number) {
    if (this.sonarrApiCache[id]) {
      delete this.sonarrApiCache[id];
    }
  }

  // Sportarr talks to its own native /api/ (not /api/v3/), but the client
  // construction + per-instance cache mirror the Sonarr path exactly.
  public async getSportarrApiClient(id: number | SportarrSettingRawDto) {
    if (typeof id === 'object') {
      return new SportarrApi(
        {
          url: `${id.url}/api/`,
          apiKey: `${id.apiKey}`,
        },
        this.loggerFactory.createLogger(),
      );
    } else {
      if (!this.sportarrApiCache[id]) {
        const setting = await this.settings.getSportarrSetting(id);

        if (setting == null || !('id' in setting)) {
          throw new Error('Sportarr setting not found');
        }

        const cacheKey = `sportarr-${id}`;
        if (!cacheManager.getCache(cacheKey)) {
          cacheManager.createCache(cacheKey, `Sportarr-${id}`, 'sportarr');
        }

        this.sportarrApiCache[id] = new SportarrApi(
          {
            url: `${setting.url}/api/`,
            apiKey: `${setting.apiKey}`,
            cacheName: cacheKey,
          },
          this.loggerFactory.createLogger(),
        );
      }

      return this.sportarrApiCache[id];
    }
  }

  public deleteCachedSportarrApiClient(id: number) {
    if (this.sportarrApiCache[id]) {
      delete this.sportarrApiCache[id];
    }
  }
}
