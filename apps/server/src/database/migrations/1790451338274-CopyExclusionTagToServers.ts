import { MigrationInterface, QueryRunner } from 'typeorm';

type Service = 'radarr' | 'sonarr';

/**
 * The Radarr/Sonarr exclusion tag moves from one setting per service to one per
 * server. Each server starts with the settings its service had, so nothing tags
 * differently after the upgrade.
 *
 * Flags are written as real booleans: the entity column stores anything but
 * `true` as 0.
 */
export class CopyExclusionTagToServers1790451338274 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const service of ['radarr', 'sonarr'] as Service[]) {
      const settings:
        Record<'enabled' | 'label' | 'untag', unknown> | undefined =
        await queryRunner.manager
          .createQueryBuilder()
          .select(`settings.${service}_tag_exclusions`, 'enabled')
          .addSelect(`settings.${service}_exclusion_tag`, 'label')
          .addSelect(`settings.${service}_untag_on_unexclude`, 'untag')
          .from('settings', 'settings')
          .getRawOne();
      if (!settings) continue;

      await queryRunner.manager
        .createQueryBuilder()
        .update(`${service}_settings`)
        .set({
          tagExclusions: Boolean(settings.enabled),
          exclusionTag: settings.label,
          untagOnUnexclude: Boolean(settings.untag),
        })
        .execute();
    }
  }

  // Nothing to restore: the query builder cannot write columns the Settings
  // entity no longer declares, so after a revert the global tag settings are
  // back at their defaults (off, "dnd").
  public async down(): Promise<void> {}
}
