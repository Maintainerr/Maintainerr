import { PartialType } from '@nestjs/mapped-types';
import { SettingDto } from './setting.dto';

export class UpdateSettingDto extends PartialType(SettingDto) {}
