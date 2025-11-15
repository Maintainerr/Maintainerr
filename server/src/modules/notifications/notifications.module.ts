import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notifications.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { NotificationTimerService } from './notifications-timer.service';
import { TasksModule } from '../tasks/tasks.module';
import { CollectionsModule } from '../collections/collections.module';

@Module({
  imports: [
    PlexApiModule,
    CollectionsModule,
    TasksModule,
    TypeOrmModule.forFeature([Notification, RuleGroup]),
  ],
  providers: [NotificationService, NotificationTimerService],
  controllers: [NotificationsController],
  exports: [NotificationService],
})
export class NotificationsModule {}
