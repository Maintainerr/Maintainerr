import { Injectable } from '@nestjs/common';
import { Status } from './interfaces/status.interface';

@Injectable()
export class StatusService {
  public createStatus(status: boolean, message: string): Status {
    return status
      ? { code: 1, message: message }
      : { code: 0, message: message };
  }
}
