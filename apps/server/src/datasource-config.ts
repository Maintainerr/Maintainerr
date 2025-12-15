import { DataSource } from 'typeorm';

const datasource = new DataSource({
  type: 'better-sqlite3',
  database: '../../data/maintainerr.sqlite',
  entities: ['./dist/**/*.entities{.ts,.js}'],
  synchronize: false,
  migrationsTableName: 'migrations',
  migrations: ['./dist/database/migrations/**/*{.js,.ts}'],
});

datasource
  .initialize()
  .then(() => {
    console.log(`Data Source has been initialized`);
  })
  .catch((err) => {
    console.error(`Data Source initialization error`, err);
  });

export default datasource;
