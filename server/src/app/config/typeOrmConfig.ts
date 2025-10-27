import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import path from 'path';

const ormConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const dataDir = configService.get<string>('DATA_DIR');
  const appDir = configService.get<string>('APP_DIR');

  return {
    type: 'sqlite',
    logging: false,
    database:
      process.env.NODE_ENV === 'production'
        ? path.join(dataDir, 'maintainerr.sqlite')
        : '../data/maintainerr.sqlite',
    subscribers: ['./**/*.subscriber{.ts,.js}'],
    migrations:
      process.env.NODE_ENV === 'production'
        ? [path.join(appDir, 'server/dist/database/migrations/**/*{.js,.ts}')]
        : ['./dist/database/migrations/**/*{.js,.ts}'],
    autoLoadEntities: true,
    migrationsRun: true,
  };
};
export default ormConfig;
