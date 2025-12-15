import { MaintainerrLogger } from '../../../logging/logs.service';
import { ExternalApiService } from '../../external-api/external-api.service';

export class InternalApi extends ExternalApiService {
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
    logger.setContext(InternalApi.name);
    super(
      url,
      {
        headers: {
          'X-Api-Key': apiKey,
        },
      },
      logger,
    );
  }
}
