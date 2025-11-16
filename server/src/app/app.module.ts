import { Module, OnModuleInit } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GracefulShutdownModule } from '@tygra/nestjs-graceful-shutdown';
import { ZodValidationPipe } from 'nestjs-zod';
import { join } from 'path';
import { ExternalApiModule } from '../modules/api/external-api/external-api.module';
import { GitHubApiModule } from '../modules/api/github-api/github-api.module';
import { JellyseerrApiModule } from '../modules/api/jellyseerr-api/jellyseerr-api.module';
import { JellyseerrApiService } from '../modules/api/jellyseerr-api/jellyseerr-api.service';
import { OverseerrApiModule } from '../modules/api/overseerr-api/overseerr-api.module';
import { OverseerrApiService } from '../modules/api/overseerr-api/overseerr-api.service';
import { PlexApiModule } from '../modules/api/plex-api/plex-api.module';
import { PlexApiService } from '../modules/api/plex-api/plex-api.service';
import { ServarrApiModule } from '../modules/api/servarr-api/servarr-api.module';
import { TautulliApiModule } from '../modules/api/tautulli-api/tautulli-api.module';
import { TautulliApiService } from '../modules/api/tautulli-api/tautulli-api.service';
import { TmdbApiModule } from '../modules/api/tmdb-api/tmdb.module';
import { CollectionsModule } from '../modules/collections/collections.module';
import { EventsModule } from '../modules/events/events.module';
import { LogsModule } from '../modules/logging/logs.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { NotificationService } from '../modules/notifications/notifications.service';
import { RulesModule } from '../modules/rules/rules.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { SettingsService } from '../modules/settings/settings.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import ormConfig from './config/typeOrmConfig';

@Module({
  imports: [
    GracefulShutdownModule.forRoot(),
    TypeOrmModule.forRoot(ormConfig),
    EventEmitterModule.forRoot({
      wildcard: true,
    }),
    LogsModule,
    SettingsModule,
    PlexApiModule,
    ExternalApiModule,
    GitHubApiModule,
    TmdbApiModule,
    ServarrApiModule,
    OverseerrApiModule,
    TautulliApiModule,
    JellyseerrApiModule,
    RulesModule,
    CollectionsModule,
    NotificationsModule,
    EventsModule,
    ServeStaticModule.forRootAsync({
      useFactory: () => {
        if (process.env.NODE_ENV !== 'production') {
          return [];
        }

        return [
          {
            rootPath: join(__dirname, '..', 'ui'),
          },
        ];
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly settings: SettingsService,
    private readonly plexApi: PlexApiService,
    private readonly overseerApi: OverseerrApiService,
    private readonly tautulliApi: TautulliApiService,
    private readonly notificationService: NotificationService,
    private readonly jellyseerrApi: JellyseerrApiService,
  ) {}
  async onModuleInit() {
    // Initialize modules requiring settings
    await this.settings.init();
    await this.plexApi.initialize({});
    this.overseerApi.init();
    this.tautulliApi.init();
    this.jellyseerrApi.init();

    // intialize notification agents
    await this.notificationService.registerConfiguredAgents();
  }
}
