import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { JellyfinApi } from '../lib/jellyfinApi';
import { PlexLibraryItem } from '../plex-api/interfaces/library.interfaces';
import {
  JellyfinInfoResponse,
  JellyfinItemsResponse,
  JellyfinUserDataResponse,
  JellyfinUserResponse
} from './interfaces/server.interfaces';

enum itemType {
  movie = "Movie",
  show = "Series",
  season = "Season",
  episode = "Episode",
}

@Injectable()
export class JellyfinApiService {
  private api: JellyfinApi;
  private readonly logger = new Logger(JellyfinApiService.name);

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
  ) {
    this.init();
  }

  public async init() {
    try {
      const url = this.settings.jellyfin_url;
      const apiKey = this.settings.jellyfin_api_key;
      if (url && apiKey) {
        this.api = new JellyfinApi({ url, apiKey });
      } else {
        this.logger.log(
          "Jellyfin API isn't fully initialized, required settings aren't set",
        );
      }
    } catch (err) {
      this.logger.warn(
        `Couldn't connect to Jellyfin.. Please check your settings`,
      );
      this.logger.debug(err);
    }
  }

  public async getStatus() {
    try {
      const response: JellyfinInfoResponse = await this.api.get('/System/Info');
      return response;
    } catch (err) {
      this.logger.warn(
        'Jellyfin api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getMediaId(tmdbId: number, type: "movie" | "show" | "season" | "episode" | "collection") {
    try {
      const response: JellyfinItemsResponse = await this.api.get(`/Items?recursive=true&includeItemTypes=${type == "movie" ? itemType.movie : itemType.show}&fields=ProviderIds`);
      if (response.Items.length > 0) {
        const media = response.Items.find((jellyfinItem) => +jellyfinItem.ProviderIds.Tmdb == tmdbId);
        if (media)
          return media.Id
      }
      this.logger.warn(
        `Media with tmdbId ${tmdbId} not found`,
      );
      return null;
    } catch (err) {
      this.logger.warn(
        'Jellyfin api communication failure.. Is the application running?',
      );
      this.logger.warn(err);
      return undefined;
    }
  }

  public async getUsersIds() {
    try {
      const response: JellyfinUserResponse = await this.api.get('/Users');
      if (response.length > 0) {
        return response.map((user) => user.Id);
      }
      return null;
    } catch (err) {
      this.logger.warn(
        'Jellyfin api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getLastSeen(tmdbId: number, libItem: PlexLibraryItem) {
    try {
      let seenDates: Date[] = [];
      const usersIds = await this.getUsersIds();
      const mediaId = await this.getMediaId(tmdbId, libItem.type);
      if (!mediaId)
        return null;
      
      // Create an array of promises to fetch the user data in parallel
      const userPromises = usersIds.map(async (userId) => {
        // Get user data for each media id (ex: all episodes of a show)
        let userDatas: JellyfinUserDataResponse[] = [];
        switch(libItem.type) {
          case "movie":
            const response: JellyfinUserDataResponse = await this.api.get(`/UserItems/${mediaId}/UserData?userId=${userId}`);
            if (response && response.LastPlayedDate)
              userDatas = [response]
            break;
          default:
            const episodes = await this.getEpisodesUserData(userId, mediaId, libItem);
            if (episodes && episodes.length > 0)
              userDatas = episodes
            break;
        }
        if (userDatas.length > 0) {
          for (let userData of userDatas) {
            if (userData.LastPlayedDate) {
              const userSeen = new Date(userData.LastPlayedDate);
              seenDates.push(userSeen);
            }
          }
        }
      });
  
      // Wait for all the promises to complete
      await Promise.all(userPromises);
      return new Date(Math.max(...seenDates.map(date => date.getTime())));
    } catch (err) {
      this.logger.warn(
        'Jellyfin api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }
  
  public async getTimesViewed(tmdbId: number, libItem: PlexLibraryItem) {
    try {
      let playCount = 0;
      const usersIds = await this.getUsersIds();
      const mediaId = await this.getMediaId(tmdbId, libItem.type);
      if (!mediaId)
        return null;

      // Create an array of promises to fetch the user data in parallel
      const userPromises = usersIds.map(async (userId) => {
        switch (libItem.type) {
          case "movie":
            const userData: JellyfinUserDataResponse = await this.api.get(`/UserItems/${mediaId}/UserData?userId=${userId}`)
            if (userData && userData.Played) {
              playCount += userData.PlayCount;
            }
            break;
          default:
            const userDatas = await this.getEpisodesUserData(userId, mediaId, libItem);
            if (userDatas && userDatas.length > 0) {
              for (let userData of userDatas) {
                playCount += userData.PlayCount;
              }
            }
        }
      });

      // Wait for all the promises to complete
      await Promise.all(userPromises);
      return playCount;
    } catch (err) {
      this.logger.warn(
        'Jellyfin api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  async getEpisodesUserData(userId: string, showId: string, libItem: PlexLibraryItem) {
    try {
      const episodes: JellyfinItemsResponse = await this.api.get(`/Items?recursive=true&userId=${userId}&parentId=${showId}&includeItemTypes=${itemType.episode}&enableUserData=true`);
      if (episodes) {
        if (libItem.type == "season") {
          episodes.Items = episodes.Items.filter((episode) => episode.ParentIndexNumber == libItem.index);
        } else if (libItem.type == "episode") {
          episodes.Items = episodes.Items.filter((episode) => episode.ParentIndexNumber == libItem.parentIndex && episode.IndexNumber == libItem.index);
        }
        return episodes.Items.map((episode) => episode.UserData);
      }
      return null;
    } catch (err) {
      this.logger.warn(
        'Jellyfin api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }
}
