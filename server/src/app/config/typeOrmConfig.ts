import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const ormConfig: TypeOrmModuleOptions = {
  type: 'better-sqlite3',
  logging: false,
  database:
    process.env.NODE_ENV === 'production'
      ? '/opt/data/maintainerr.sqlite'
      : '../data/maintainerr.sqlite',
  subscribers: ['./**/*.subscriber{.ts,.js}'],
  migrations:
    process.env.NODE_ENV === 'production'
      ? ['/opt/app/server/dist/database/migrations/**/*{.js,.ts}']
      : ['./dist/database/migrations/**/*{.js,.ts}'],
  autoLoadEntities: true,
  migrationsRun: true,
};
export default ormConfig;
