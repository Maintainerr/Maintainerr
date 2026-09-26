import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveExclusionTagToServers1790441410459 implements MigrationInterface {
  name = 'MoveExclusionTagToServers1790441410459';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_radarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "serverName" varchar NOT NULL, "url" varchar, "apiKey" varchar, "tagExclusions" boolean NOT NULL DEFAULT (0), "exclusionTag" varchar NOT NULL DEFAULT ('dnd'), "untagOnUnexclude" boolean NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_radarr_settings"("id", "serverName", "url", "apiKey") SELECT "id", "serverName", "url", "apiKey" FROM "radarr_settings"`,
    );
    await queryRunner.query(`DROP TABLE "radarr_settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_radarr_settings" RENAME TO "radarr_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_sonarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "serverName" varchar NOT NULL, "url" varchar, "apiKey" varchar, "tagExclusions" boolean NOT NULL DEFAULT (0), "exclusionTag" varchar NOT NULL DEFAULT ('dnd'), "untagOnUnexclude" boolean NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_sonarr_settings"("id", "serverName", "url", "apiKey") SELECT "id", "serverName", "url", "apiKey" FROM "sonarr_settings"`,
    );
    await queryRunner.query(`DROP TABLE "sonarr_settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_sonarr_settings" RENAME TO "sonarr_settings"`,
    );
    // Each server starts with the settings its service had, so nothing
    // tags differently after the upgrade. The flags go in as real booleans:
    // the entity column stores anything but `true` as 0.
    const global:
      | Record<
          | 'radarr_tag_exclusions'
          | 'radarr_exclusion_tag'
          | 'radarr_untag_on_unexclude'
          | 'sonarr_tag_exclusions'
          | 'sonarr_exclusion_tag'
          | 'sonarr_untag_on_unexclude',
          unknown
        >
      | undefined = await queryRunner.manager
      .createQueryBuilder()
      .select('settings.radarr_tag_exclusions', 'radarr_tag_exclusions')
      .addSelect('settings.radarr_exclusion_tag', 'radarr_exclusion_tag')
      .addSelect(
        'settings.radarr_untag_on_unexclude',
        'radarr_untag_on_unexclude',
      )
      .addSelect('settings.sonarr_tag_exclusions', 'sonarr_tag_exclusions')
      .addSelect('settings.sonarr_exclusion_tag', 'sonarr_exclusion_tag')
      .addSelect(
        'settings.sonarr_untag_on_unexclude',
        'sonarr_untag_on_unexclude',
      )
      .from('settings', 'settings')
      .getRawOne();
    if (global) {
      for (const service of ['radarr', 'sonarr'] as const) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(`${service}_settings`)
          .set({
            tagExclusions: Boolean(global[`${service}_tag_exclusions`]),
            exclusionTag: global[`${service}_exclusion_tag`],
            untagOnUnexclude: Boolean(global[`${service}_untag_on_unexclude`]),
          })
          .execute();
      }
    }
    await queryRunner.query(
      `CREATE TABLE "temporary_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "clientId" varchar, "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'), "applicationUrl" varchar NOT NULL DEFAULT ('localhost'), "apikey" varchar, "locale" varchar NOT NULL DEFAULT ('en'), "plex_name" varchar, "plex_hostname" varchar, "plex_port" integer DEFAULT (32400), "plex_ssl" integer, "plex_auth_token" varchar, "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'), "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'), "tautulli_url" varchar, "tautulli_api_key" varchar, "media_server_type" varchar, "jellyfin_url" varchar, "jellyfin_api_key" varchar, "jellyfin_user_id" varchar, "jellyfin_server_name" varchar, "seerr_url" varchar, "seerr_api_key" varchar, "tmdb_api_key" varchar, "tvdb_api_key" varchar, "metadata_provider_preference" varchar NOT NULL DEFAULT ('tmdb_primary'), "plex_machine_id" varchar, "plex_manual_mode" integer DEFAULT (0), "emby_url" varchar, "emby_api_key" varchar, "emby_user_id" varchar, "emby_server_name" varchar, "streamystats_url" varchar, "download_client_url" varchar, "download_client_username" varchar, "download_client_password" varchar, "download_client_delete_data" boolean DEFAULT (1), "download_client_fallback_ratio" float NOT NULL DEFAULT (0.5), "tracearr_url" varchar, "tracearr_api_key" varchar, "tracearr_server_id" varchar, "telemetryEnabled" boolean, "download_client_type" varchar, "ombi_url" varchar, "ombi_api_key" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_settings"("id", "clientId", "applicationTitle", "applicationUrl", "apikey", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "media_server_type", "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name", "seerr_url", "seerr_api_key", "tmdb_api_key", "tvdb_api_key", "metadata_provider_preference", "plex_machine_id", "plex_manual_mode", "emby_url", "emby_api_key", "emby_user_id", "emby_server_name", "streamystats_url", "download_client_url", "download_client_username", "download_client_password", "download_client_delete_data", "download_client_fallback_ratio", "tracearr_url", "tracearr_api_key", "tracearr_server_id", "telemetryEnabled", "download_client_type", "ombi_url", "ombi_api_key") SELECT "id", "clientId", "applicationTitle", "applicationUrl", "apikey", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "media_server_type", "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name", "seerr_url", "seerr_api_key", "tmdb_api_key", "tvdb_api_key", "metadata_provider_preference", "plex_machine_id", "plex_manual_mode", "emby_url", "emby_api_key", "emby_user_id", "emby_server_name", "streamystats_url", "download_client_url", "download_client_username", "download_client_password", "download_client_delete_data", "download_client_fallback_ratio", "tracearr_url", "tracearr_api_key", "tracearr_server_id", "telemetryEnabled", "download_client_type", "ombi_url", "ombi_api_key" FROM "settings"`,
    );
    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_settings" RENAME TO "settings"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sonarr_settings" RENAME TO "temporary_sonarr_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "sonarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "serverName" varchar NOT NULL, "url" varchar, "apiKey" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "sonarr_settings"("id", "serverName", "url", "apiKey") SELECT "id", "serverName", "url", "apiKey" FROM "temporary_sonarr_settings"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_sonarr_settings"`);
    await queryRunner.query(
      `ALTER TABLE "radarr_settings" RENAME TO "temporary_radarr_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "radarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "serverName" varchar NOT NULL, "url" varchar, "apiKey" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "radarr_settings"("id", "serverName", "url", "apiKey") SELECT "id", "serverName", "url", "apiKey" FROM "temporary_radarr_settings"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_radarr_settings"`);
    await queryRunner.query(
      `ALTER TABLE "settings" RENAME TO "temporary_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "clientId" varchar, "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'), "applicationUrl" varchar NOT NULL DEFAULT ('localhost'), "apikey" varchar, "locale" varchar NOT NULL DEFAULT ('en'), "plex_name" varchar, "plex_hostname" varchar, "plex_port" integer DEFAULT (32400), "plex_ssl" integer, "plex_auth_token" varchar, "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'), "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'), "tautulli_url" varchar, "tautulli_api_key" varchar, "media_server_type" varchar, "jellyfin_url" varchar, "jellyfin_api_key" varchar, "jellyfin_user_id" varchar, "jellyfin_server_name" varchar, "seerr_url" varchar, "seerr_api_key" varchar, "tmdb_api_key" varchar, "tvdb_api_key" varchar, "metadata_provider_preference" varchar NOT NULL DEFAULT ('tmdb_primary'), "plex_machine_id" varchar, "plex_manual_mode" integer DEFAULT (0), "emby_url" varchar, "emby_api_key" varchar, "emby_user_id" varchar, "emby_server_name" varchar, "streamystats_url" varchar, "download_client_url" varchar, "download_client_username" varchar, "download_client_password" varchar, "download_client_delete_data" boolean DEFAULT (1), "download_client_fallback_ratio" float NOT NULL DEFAULT (0.5), "radarr_tag_exclusions" boolean NOT NULL DEFAULT (0), "radarr_exclusion_tag" varchar NOT NULL DEFAULT ('dnd'), "radarr_untag_on_unexclude" boolean NOT NULL DEFAULT (0), "sonarr_tag_exclusions" boolean NOT NULL DEFAULT (0), "sonarr_exclusion_tag" varchar NOT NULL DEFAULT ('dnd'), "sonarr_untag_on_unexclude" boolean NOT NULL DEFAULT (0), "tracearr_url" varchar, "tracearr_api_key" varchar, "tracearr_server_id" varchar, "telemetryEnabled" boolean, "download_client_type" varchar, "ombi_url" varchar, "ombi_api_key" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "settings"("id", "clientId", "applicationTitle", "applicationUrl", "apikey", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "media_server_type", "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name", "seerr_url", "seerr_api_key", "tmdb_api_key", "tvdb_api_key", "metadata_provider_preference", "plex_machine_id", "plex_manual_mode", "emby_url", "emby_api_key", "emby_user_id", "emby_server_name", "streamystats_url", "download_client_url", "download_client_username", "download_client_password", "download_client_delete_data", "download_client_fallback_ratio", "tracearr_url", "tracearr_api_key", "tracearr_server_id", "telemetryEnabled", "download_client_type", "ombi_url", "ombi_api_key") SELECT "id", "clientId", "applicationTitle", "applicationUrl", "apikey", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "media_server_type", "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name", "seerr_url", "seerr_api_key", "tmdb_api_key", "tvdb_api_key", "metadata_provider_preference", "plex_machine_id", "plex_manual_mode", "emby_url", "emby_api_key", "emby_user_id", "emby_server_name", "streamystats_url", "download_client_url", "download_client_username", "download_client_password", "download_client_delete_data", "download_client_fallback_ratio", "tracearr_url", "tracearr_api_key", "tracearr_server_id", "telemetryEnabled", "download_client_type", "ombi_url", "ombi_api_key" FROM "temporary_settings"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_settings"`);
  }
}
