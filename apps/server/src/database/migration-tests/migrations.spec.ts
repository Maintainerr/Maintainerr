import * as fs from 'fs';
import * as path from 'path';
import { DataSource, MigrationInterface } from 'typeorm';

// Generic migration matrix — we don't test each migration individually. These
// confirm TypeORM behaves and that migrations comply with typeorm_instructions.txt
// (generated from the entities, never hand-waived):
//   1. The whole chain applies in order on a fresh DB, each recorded once —
//      proving every migration is structurally valid SQL that TypeORM accepts.
//   2. The schema migration this PR adds reproduces its entity columns EXACTLY
//      (type + NOT NULL + default). A hand-edited migration that drifts from the
//      entity definition fails here — the in-jest stand-in for `migration:generate`
//      reporting "No changes". (The repo-wide entity-vs-schema diff stays a manual
//      release step: TypeORM's metadata builder can't run under @swc/jest, which
//      reflects the codebase's `T | null` columns as `Object` and rejects the
//      build. A new migration adds its columns to test 2.)
//   3. That migration's up() carries TypeORM's SQLite create-temporary-table
//      rebuild — the fingerprint of `migration:generate`. Matching columns (2)
//      can be reproduced by a hand-written `ALTER TABLE ADD COLUMN`; the rebuild
//      cannot, so its absence flags a hand-waived migration.
//   4. The newest migration's down() is symmetric.
// v1→current upgrade + rule-operator backfill live in upgrade-from-1x.spec.ts.

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
type MigrationCtor = new () => MigrationInterface;

const loadMigrations = (): { ts: number; file: string; cls: MigrationCtor }[] =>
  fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+-.*\.ts$/.test(f))
    .map((file) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.join(MIGRATIONS_DIR, file));
      const cls = Object.values(mod).find(
        (v): v is MigrationCtor => typeof v === 'function',
      );
      return { ts: Number(file.split('-')[0]), file, cls: cls! };
    })
    .sort((a, b) => a.ts - b.ts);

const makeDS = (migrations: MigrationCtor[]) =>
  new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: false,
    migrationsTableName: 'migrations',
    entities: [],
    migrations,
  });

type ColInfo = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
};
const columns = (ds: DataSource, table: string): Promise<ColInfo[]> =>
  ds.query(`PRAGMA table_info('${table}')`);
const byName = (cols: ColInfo[]): Record<string, ColInfo> =>
  Object.fromEntries(cols.map((c) => [c.name, c]));

describe('database migrations', () => {
  const all = loadMigrations();

  it('apply in order on a fresh DB, each recorded exactly once', async () => {
    const ds = await makeDS(all.map((m) => m.cls)).initialize();
    try {
      const applied = await ds.runMigrations();
      expect(applied).toHaveLength(all.length);

      const [{ c }] = await ds.query(`SELECT COUNT(*) AS c FROM migrations`);
      expect(Number(c)).toBe(all.length);

      const tables = (
        await ds.query(`SELECT name FROM sqlite_master WHERE type='table'`)
      ).map((t: { name: string }) => t.name);
      expect(tables).toEqual(
        expect.arrayContaining([
          'settings',
          'collection',
          'rules',
          'rule_group',
          'exclusion',
        ]),
      );
    } finally {
      await ds.destroy();
    }
  });

  it('add exactly the entity-declared columns (generated, not hand-waived)', async () => {
    const ds = await makeDS(all.map((m) => m.cls)).initialize();
    try {
      await ds.runMigrations();
      const collection = byName(await columns(ds, 'collection'));
      const settings = byName(await columns(ds, 'settings'));

      // Must match the @Column definitions exactly; a hand-edited migration that
      // drifted (wrong type/default/nullability) would not.
      const bool = { type: 'boolean', notnull: 1, dflt_value: '0' };
      const dnd = { type: 'varchar', notnull: 1, dflt_value: "'dnd'" };
      expect(collection.tagInArr).toMatchObject(bool);
      expect(settings.radarr_tag_exclusions).toMatchObject(bool);
      expect(settings.radarr_exclusion_tag).toMatchObject(dnd);
      expect(settings.radarr_untag_on_unexclude).toMatchObject(bool);
      expect(settings.sonarr_tag_exclusions).toMatchObject(bool);
      expect(settings.sonarr_exclusion_tag).toMatchObject(dnd);
      expect(settings.sonarr_untag_on_unexclude).toMatchObject(bool);
    } finally {
      await ds.destroy();
    }
  });

  it('emit the SQLite create-temporary-table rebuild (generated, not hand-waived)', () => {
    const newest = all[all.length - 1];
    const src = fs.readFileSync(path.join(MIGRATIONS_DIR, newest.file), 'utf8');
    // SQLite can't ALTER most columns in place, so `migration:generate` always
    // emits a full create-temporary-table / copy / drop / rename rebuild for the
    // changed tables. A hand-written ALTER shortcut lacks it — this is the
    // cheapest signal the migration was generated rather than authored.
    expect(src).toContain('CREATE TABLE "temporary_collection"');
    expect(src).toContain('CREATE TABLE "temporary_settings"');
  });

  // We don't revert the whole chain: several pre-existing migrations have
  // non-reversible down() paths (production only ever migrates up). We do confirm
  // the newest migration's down() is symmetric — the regression this catches when
  // a migration is added.
  it('revert the newest migration cleanly (symmetric down)', async () => {
    const ds = await makeDS(all.map((m) => m.cls)).initialize();
    try {
      await ds.runMigrations();
      const has = async () =>
        (await columns(ds, 'collection')).some((c) => c.name === 'tagInArr');
      expect(await has()).toBe(true);

      await ds.undoLastMigration();

      expect(await has()).toBe(false);
      const [{ c }] = await ds.query(`SELECT COUNT(*) AS c FROM migrations`);
      expect(Number(c)).toBe(all.length - 1);
    } finally {
      await ds.destroy();
    }
  });
});
