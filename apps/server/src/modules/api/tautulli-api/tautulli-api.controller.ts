import { Controller } from '@nestjs/common';
import { TautulliApiService } from './tautulli-api.service';

@Controller('api/tautulli')
export class TautulliApiController {
  constructor(private readonly tautulliApiService: TautulliApiService) {}
}
