import { MaintainerrLogger } from '../../../logging/logs.service';
import { ExternalApiService } from '../../external-api/external-api.service';
import cacheManager from '../../lib/cache';

export class StreamystatsApi extends ExternalApiService {
  constructor(
    { url, apiKey }: { url: string; apiKey?: string },
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(StreamystatsApi.name);
    super(url, {}, logger, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      nodeCache: cacheManager.getCache('streamystats').data,
    });
  }
}
