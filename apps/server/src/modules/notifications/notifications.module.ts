import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notifications.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { NotificationTimerService } from './notifications-timer.service';
import { VersionNotificationService } from './version-notification.service';
import { TasksModule } from '../tasks/tasks.module';
import { CollectionsModule } from '../collections/collections.module';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { SeerrApiModule } from '../api/seerr-api/seerr-api.module';
import { VersionModule } from '../version/version.module';

@Module({
  imports: [
    PlexApiModule,
    CollectionsModule,
    TasksModule,
    MediaServerModule,
    SeerrApiModule,
    VersionModule,
    TypeOrmModule.forFeature([Notification, RuleGroup]),
  ],
  providers: [
    NotificationService,
    NotificationTimerService,
    VersionNotificationService,
  ],
  controllers: [NotificationsController],
  exports: [NotificationService],
})
export class NotificationsModule {}
