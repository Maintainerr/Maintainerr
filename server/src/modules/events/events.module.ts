import { Module } from '@nestjs/common';
import { EventsBufferService } from './events-buffer.service';
import { EventsController } from './events.controller';

@Module({
  providers: [EventsBufferService],
  exports: [EventsBufferService],
  controllers: [EventsController],
})
export class EventsModule {}
