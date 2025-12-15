import { Controller } from '@nestjs/common';
import { InternalApiService } from './internal-api.service';

@Controller('api/maintainerr')
export class InternalApiController {
  constructor(private readonly internalApi: InternalApiService) {}
}
