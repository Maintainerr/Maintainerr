import * as fs from 'fs';
import * as path from 'path';
import { DataSource, MigrationInterface } from 'typeorm';

// Last migration that shipped in the final 1.x release (v1.7.1). A user
// upgrading from 1.x has these 6 recorded; everything after must apply on top.
const V171_BOUNDARY = 1702366607151;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const DB = path.join(__dirname, 'upgrade-sim.sqlite');

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
    database: DB,
    entities: [],
    synchronize: false,
    migrationsTableName: 'migrations',
    migrations,
  });

const rm = () =>
  ['', '-wal', '-shm'].forEach((s) => {
    if (fs.existsSync(DB + s)) fs.unlinkSync(DB + s);
  });

const ruleJson = (operator: unknown, section: number) =>
  JSON.stringify({
    operator,
    action: 0,
    firstVal: [0, 5],
    lastVal: null,
    customVal: null,
    section,
  });

describe('upgrade from v1.7.1 to current', () => {
  beforeAll(rm);
  afterAll(rm);

  it('applies every post-1.7.1 migration on a seeded 1.7.1 DB and backfills rule operators', async () => {
    const all = loadMigrations();
    const v171 = all.filter((m) => m.ts <= V171_BOUNDARY);
    expect(v171.map((m) => m.file)).toHaveLength(6);

    // --- Phase 1: reconstruct the 1.7.1 schema -----------------------------
    let ds = makeDS(v171.map((m) => m.cls));
    await ds.initialize();
    const phase1 = await ds.runMigrations();
    expect(phase1).toHaveLength(6);

    // --- Phase 2: seed representative 1.x-era data -------------------------
    // Rules whose stored operator is null (the UI never enforced it pre-#2971)
    // so the NormalizeRuleSectionOperators data migration has real work.
    await ds.query('PRAGMA foreign_keys = OFF');
    await ds.query(
      `INSERT INTO rule_group (id,name,description,libraryId,isActive,collectionId,useRules,dataType)
       VALUES (1,'Legacy group','',1,1,1,1,1)`,
    );
    const insertRule = (id: number, section: number, operator: unknown) =>
      ds.query(
        `INSERT INTO rules (id,ruleGroupId,section,ruleJson,isActive) VALUES (?,?,?,?,1)`,
        [id, 1, section, ruleJson(operator, section)],
      );
    await insertRule(1, 0, null); // first rule of group   -> stays null
    await insertRule(2, 0, null); // within section 0      -> OR  ("1")
    await insertRule(3, 1, null); // first rule of section -> AND ("0")
    await insertRule(4, 1, '1'); //  explicit operator     -> untouched
    await ds.destroy();

    // --- Phase 3: upgrade - register ALL migrations, run the pending set ---
    ds = makeDS(all.map((m) => m.cls));
    await ds.initialize();
    const phase3 = await ds.runMigrations();
    console.log(
      `Upgrade applied ${phase3.length} migrations:`,
      phase3.map((m) => m.name),
    );
    expect(phase3).toHaveLength(all.length - 6);

    // Every migration is now recorded exactly once.
    const [{ c }] = await ds.query(`SELECT COUNT(*) AS c FROM migrations`);
    expect(Number(c)).toBe(all.length);

    // Seeded rules survived the table rebuilds and the operator data migration
    // wrote back each rule's effective behaviour (preserving how it matched).
    const rows: { id: number; ruleJson: string }[] = await ds.query(
      `SELECT id, ruleJson FROM rules ORDER BY id`,
    );
    expect(rows).toHaveLength(4);
    const op = (id: number) =>
      JSON.parse(rows.find((r) => r.id === id)!.ruleJson).operator;
    expect(op(1)).toBeNull();
    expect(op(2)).toBe('1');
    expect(op(3)).toBe('0');
    expect(op(4)).toBe('1');

    // Late (3.x-era) migrations actually ran: spot-check schema they introduce.
    const tables: string[] = (
      await ds.query(`SELECT name FROM sqlite_master WHERE type='table'`)
    ).map((t: { name: string }) => t.name);
    const settingsCols: string[] = (
      await ds.query(`PRAGMA table_info('settings')`)
    ).map((c: { name: string }) => c.name);
    // JellyfinSupport / AddEmbySupport / Streamystats settings columns
    expect(settingsCols).toEqual(
      expect.arrayContaining(['jellyfin_url', 'emby_url', 'streamystats_url']),
    );
    // metadata + storage-reclaim feature tables
    expect(tables).toEqual(
      expect.arrayContaining(['collection_media', 'rules', 'rule_group']),
    );

    await ds.destroy();
  });
});
