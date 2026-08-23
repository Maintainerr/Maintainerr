import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Collection } from '../collections/entities/collection.entities';
import { Notification } from '../notifications/entities/notification.entities';
import { RuleConstanstService } from '../rules/constants/constants.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Rules } from '../rules/entities/rules.entities';
import { TasksModule } from '../tasks/tasks.module';
import { VersionModule } from '../version/version.module';
import { TelemetryService } from './telemetry.service';
import { TelemetryTaskService } from './telemetry-task.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Rules,
      RuleGroup,
      Collection,
      Exclusion,
      Notification,
    ]),
    TasksModule,
    VersionModule,
  ],
  // RuleConstanstService takes no dependencies and RulesModule does not export
  // it, so it is provided here rather than importing the whole rules module for
  // one lookup table. SettingsDataService arrives from the global SettingsModule.
  providers: [TelemetryService, TelemetryTaskService, RuleConstanstService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
