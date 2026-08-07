import { MediaServerType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { MaintainerrLogger } from '../logging/logs.service';

/**
 * The users a rule can be scoped to (see PER_USER_PROPERTIES), named as the
 * getters resolve them. On Plex that is the plex.tv-corrected list the
 * Tautulli getter maps history rows to, which can spell an account
 * differently from the server's own account list.
 */
@Injectable()
export class RuleUsersService {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly plexApi: PlexApiService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RuleUsersService.name);
  }

  async getUsernames(): Promise<string[]> {
    try {
      const serverType =
        await this.mediaServerFactory.getConfiguredServerType();

      const usernames =
        serverType === MediaServerType.PLEX
          ? (await this.plexApi.getCorrectedUsers()).map(
              (user) => user.username,
            )
          : (await (await this.mediaServerFactory.getService()).getUsers()).map(
              (user) => user.name,
            );

      return [...new Set(usernames.filter(Boolean))].sort((left, right) =>
        left.localeCompare(right),
      );
    } catch (error) {
      // Offer nothing rather than the local names getCorrectedUsers falls back
      // to, which the getters would then fail to match.
      this.logger.warn('Rules - Could not resolve media server usernames');
      this.logger.debug(error);
      return [];
    }
  }
}
