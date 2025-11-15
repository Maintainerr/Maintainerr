import { MaintainerrLogger } from '../../../logging/logs.service';
import { ExternalApiService } from '../../external-api/external-api.service';
import cacheManager from '../../lib/cache';

export class JellyseerrApi extends ExternalApiService {
  constructor(
    {
      url,
      apiKey,
    }: {
      url: string;
      apiKey: string;
    },
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(JellyseerrApi.name);
    super(url, {}, logger, {
      headers: {
        'X-Api-Key': apiKey,
      },
      nodeCache: cacheManager.getCache('jellyseerr').data,
    });
  }
}
