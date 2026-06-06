import { DataSource } from 'typeorm';
import { AddDownloadClientSettings1780768873268 } from '../migrations/1780768873268-Add_Download_Client_settings';

describe('AddDownloadClientSettings migration', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      entities: [],
    });
    await dataSource.initialize();

    // The pre-download-client `settings` table (matches the migration's down()
    // schema). Created directly to stay independent of the wider entity graph.
    await dataSource.query(
      `CREATE TABLE "settings" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "clientId" varchar,
        "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'),
        "applicationUrl" varchar NOT NULL DEFAULT ('localhost'),
        "apikey" varchar,
        "locale" varchar NOT NULL DEFAULT ('en'),
        "plex_name" varchar,
        "plex_hostname" varchar,
        "plex_port" integer DEFAULT (32400),
        "plex_ssl" integer,
        "plex_auth_token" varchar,
        "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'),
        "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'),
        "tautulli_url" varchar,
        "tautulli_api_key" varchar,
        "media_server_type" varchar,
        "jellyfin_url" varchar,
        "jellyfin_api_key" varchar,
        "jellyfin_user_id" varchar,
        "jellyfin_server_name" varchar,
        "seerr_url" varchar,
        "seerr_api_key" varchar,
        "tmdb_api_key" varchar,
        "tvdb_api_key" varchar,
        "metadata_provider_preference" varchar NOT NULL DEFAULT ('tmdb_primary'),
        "plex_machine_id" varchar,
        "plex_manual_mode" integer DEFAULT (0),
        "emby_url" varchar,
        "emby_api_key" varchar,
        "emby_user_id" varchar,
        "emby_server_name" varchar,
        "streamystats_url" varchar
      )`,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const runUp = async () => {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await new AddDownloadClientSettings1780768873268().up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  };

  const runDown = async () => {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await new AddDownloadClientSettings1780768873268().down(queryRunner);
    } finally {
      await queryRunner.release();
    }
  };

  const columnNames = async (): Promise<string[]> => {
    const rows: Array<{ name: string }> = await dataSource.query(
      `PRAGMA table_info("settings")`,
    );
    return rows.map((r) => r.name);
  };

  it('adds the download_client_* columns with the expected defaults', async () => {
    await dataSource.query(
      `INSERT INTO "settings" ("id", "applicationTitle") VALUES (1, 'Maintainerr')`,
    );

    await runUp();

    const columns = await columnNames();
    expect(columns).toEqual(
      expect.arrayContaining([
        'download_client_url',
        'download_client_username',
        'download_client_password',
        'download_client_delete_data',
        'download_client_fallback_ratio',
      ]),
    );

    const [row] = await dataSource.query(
      `SELECT "download_client_url", "download_client_delete_data", "download_client_fallback_ratio" FROM "settings" WHERE "id" = 1`,
    );
    expect(row.download_client_url).toBeNull();
    // delete-data defaults enabled (1), fallback ratio defaults to 0.5.
    expect(row.download_client_delete_data).toBe(1);
    expect(row.download_client_fallback_ratio).toBe(0.5);
  });

  it('preserves existing settings data through the table rebuild', async () => {
    await dataSource.query(
      `INSERT INTO "settings" ("id", "applicationTitle", "tautulli_url", "streamystats_url") VALUES (1, 'My Maintainerr', 'http://localhost:8181', 'http://localhost:3000')`,
    );

    await runUp();

    const [row] = await dataSource.query(
      `SELECT "applicationTitle", "tautulli_url", "streamystats_url" FROM "settings" WHERE "id" = 1`,
    );
    expect(row.applicationTitle).toBe('My Maintainerr');
    expect(row.tautulli_url).toBe('http://localhost:8181');
    expect(row.streamystats_url).toBe('http://localhost:3000');
  });

  it('removes the download_client_* columns on revert', async () => {
    await runUp();
    await runDown();

    const columns = await columnNames();
    expect(columns).not.toContain('download_client_url');
    expect(columns).not.toContain('download_client_fallback_ratio');
  });
});
