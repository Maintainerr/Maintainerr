import { DataSource } from 'typeorm';

const datasource = new DataSource({
  type: 'better-sqlite3',
  database: '../../data/maintainerr.sqlite',
  entities: ['./src/**/*.entities.ts'],
  synchronize: false,
  migrationsTableName: 'migrations',
  migrations: ['./src/database/migrations/**/*.ts'],
});

datasource
  .initialize()
  .then(() => {
    console.log(`Data Source has been initialized`);
  })
  .catch((error) => {
    console.error(`Data Source initialization error`, error);
  });

export default datasource;
