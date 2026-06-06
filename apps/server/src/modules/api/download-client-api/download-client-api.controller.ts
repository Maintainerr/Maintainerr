import { Controller } from '@nestjs/common';

// The download client has no direct HTTP surface of its own — it is consumed
// internally by the action handlers and configured/tested via the settings
// controller.
@Controller('api/download-client')
export class DownloadClientApiController {}
