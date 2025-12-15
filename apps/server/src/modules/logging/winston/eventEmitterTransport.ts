import Transport, { TransportStreamOptions } from 'winston-transport';
import { EventEmitter2 } from '@nestjs/event-emitter';

export class EventEmitterTransport extends Transport {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    opts?: TransportStreamOptions,
  ) {
    super(opts);
  }

  log(info: any, next: () => void) {
    setImmediate(() => this.emit('logged', info));
    this.eventEmitter.emit('log', info);
    next();
  }
}
