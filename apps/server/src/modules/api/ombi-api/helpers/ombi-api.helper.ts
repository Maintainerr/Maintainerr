import { MaintainerrLogger } from '../../../logging/logs.service';
import { ExternalApiService } from '../../external-api/external-api.service';

export class OmbiApi extends ExternalApiService {
  constructor(
    { url, apiKey }: { url: string; apiKey: string },
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(OmbiApi.name);
    // No version in the base: the request lists are v1, the lookups v2.
    super(`${url}/api`, {}, logger, { headers: { ApiKey: apiKey } });
  }
}
