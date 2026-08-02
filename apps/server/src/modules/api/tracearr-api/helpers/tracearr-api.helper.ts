import { MaintainerrLogger } from '../../../logging/logs.service';
import { ExternalApiService } from '../../external-api/external-api.service';
import cacheManager from '../../lib/cache';

const withoutTrailingSlashes = (value: string): string => {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return value.slice(0, end);
};

export class TracearrApi extends ExternalApiService {
  constructor(
    { url, apiKey }: { url: string; apiKey: string },
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TracearrApi.name);
    super(`${withoutTrailingSlashes(url)}/api/v2/public`, {}, logger, {
      headers: { Authorization: `Bearer ${apiKey}` },
      nodeCache: cacheManager.getCache('tracearr')?.data,
    });
  }
}
