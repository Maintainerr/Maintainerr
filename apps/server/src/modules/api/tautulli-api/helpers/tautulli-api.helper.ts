import { MaintainerrLogger } from '../../../logging/logs.service';
import { ExternalApiService } from '../../external-api/external-api.service';
import cacheManager from '../../lib/cache';

export class TautulliApi extends ExternalApiService {
  constructor(
    { url, apiKey }: { url: string; apiKey: string },
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TautulliApi.name);
    super(
      url,
      {
        apikey: apiKey,
      },
      logger,
      {
        nodeCache: cacheManager.getCache('tautulli').data,
      },
    );
  }
}
