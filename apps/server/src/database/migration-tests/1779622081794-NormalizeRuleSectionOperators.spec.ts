import { DataSource } from 'typeorm';
import { NormalizeRuleSectionOperators1779622081794 } from '../migrations/1779622081794-NormalizeRuleSectionOperators';

describe('NormalizeRuleSectionOperators migration', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      entities: [],
    });
    await dataSource.initialize();
    // Minimal stand-in for the `rules` table (only the columns the migration
    // reads/writes). Created here rather than via entities to keep the test
    // independent of the wider entity graph.
    await dataSource.query(
      `CREATE TABLE "rules" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "ruleJson" text NOT NULL,
        "ruleGroupId" integer NOT NULL,
        "section" integer NOT NULL DEFAULT (0),
        "isActive" boolean NOT NULL DEFAULT (1)
      )`,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const insertRule = (
    id: number,
    ruleGroupId: number,
    section: number,
    operator: string | number | null,
  ) =>
    dataSource.query(
      `INSERT INTO "rules" ("id", "ruleGroupId", "section", "ruleJson") VALUES (?, ?, ?, ?)`,
      [
        id,
        ruleGroupId,
        section,
        JSON.stringify({ operator, action: 0, firstVal: [0, 5], section }),
      ],
    );

  const runMigration = async () => {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await new NormalizeRuleSectionOperators1779622081794().up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  };

  const operatorById = async (): Promise<Map<number, unknown>> => {
    const rows: Array<{ id: number; ruleJson: string }> =
      await dataSource.query(
        `SELECT "id", "ruleJson" FROM "rules" ORDER BY "id" ASC`,
      );
    return new Map(
      rows.map((r) => [
        r.id,
        (JSON.parse(r.ruleJson) as { operator: unknown }).operator,
      ]),
    );
  };

  it('backfills null operators to their current effective behaviour', async () => {
    await insertRule(1, 1, 0, null); // first rule of group -> untouched (null)
    await insertRule(2, 1, 0, null); // within section 0 -> OR ("1")
    await insertRule(3, 1, 1, null); // first rule of section 1 -> AND ("0")
    await insertRule(4, 1, 1, '1'); // already explicit -> untouched
    await insertRule(5, 2, 0, null); // first rule of group 2 -> untouched
    await insertRule(6, 2, 1, null); // first rule of a section in group 2 -> AND ("0")

    await runMigration();

    const ops = await operatorById();
    expect(ops.get(1)).toBeNull();
    expect(ops.get(2)).toBe('1');
    expect(ops.get(3)).toBe('0');
    expect(ops.get(4)).toBe('1');
    expect(ops.get(5)).toBeNull();
    expect(ops.get(6)).toBe('0');
  });

  it('preserves the other rule fields when rewriting ruleJson', async () => {
    await insertRule(1, 1, 0, null); // first of group
    await insertRule(2, 1, 1, null); // section-1 boundary -> AND

    await runMigration();

    const rows: Array<{ id: number; ruleJson: string }> =
      await dataSource.query(
        `SELECT "id", "ruleJson" FROM "rules" WHERE "id" = 2`,
      );
    expect(JSON.parse(rows[0].ruleJson)).toEqual({
      operator: '0',
      action: 0,
      firstVal: [0, 5],
      section: 1,
    });
  });

  it('leaves rules with an explicit numeric operator untouched', async () => {
    // YAML/community imports persist operators numerically (AND = 0).
    await insertRule(1, 1, 0, null); // first of group
    await insertRule(2, 1, 0, 1); // explicit OR (number)
    await insertRule(3, 1, 1, 0); // explicit AND (number)

    await runMigration();

    const ops = await operatorById();
    expect(ops.get(2)).toBe(1);
    expect(ops.get(3)).toBe(0);
  });

  // Real-world fixture: two "Leaving Soon" groups exactly as reported from a
  // 3.12.1 backup (PR #2971 discussion) — null section boundaries plus a mix of
  // string "0" and numeric 0 within-section operators. Confirms the backfill on
  // realistic data and the human-readable summary log naming the groups.
  it('backfills real "Leaving Soon" groups and logs the group names', async () => {
    await dataSource.query(
      `CREATE TABLE "rule_group" ("id" integer PRIMARY KEY, "name" text NOT NULL)`,
    );
    await dataSource.query(
      `INSERT INTO "rule_group" ("id","name") VALUES (11,'Movies Leaving Soon'),(12,'TV Leaving Soon')`,
    );

    // Rule 11 (Movies) — ids/operators as captured from the backup
    await insertRule(439, 11, 0, null); // first of group -> stays null
    await insertRule(440, 11, 0, 0); // numeric AND (within) -> untouched
    await insertRule(441, 11, 1, null); // section boundary -> backfill "0"
    await insertRule(442, 11, 1, 0);
    await insertRule(443, 11, 1, 0);
    await insertRule(444, 11, 1, 0);
    // Rule 12 (TV) — string "0" within-section
    await insertRule(453, 12, 0, null); // first of group -> stays null
    await insertRule(454, 12, 0, '0');
    await insertRule(455, 12, 0, '0');
    await insertRule(456, 12, 1, null); // section boundary -> backfill "0"
    await insertRule(457, 12, 1, '0');
    await insertRule(458, 12, 1, '0');
    await insertRule(459, 12, 1, '0');
    await insertRule(460, 12, 1, '0');

    // Run via an explicit instance so we can read the logger it used.
    // (jest.setup mocks @nestjs/common Logger so each instance's methods are jest.fn.)
    const migration = new NormalizeRuleSectionOperators1779622081794();
    const queryRunner = dataSource.createQueryRunner();
    try {
      await migration.up(queryRunner);
    } finally {
      await queryRunner.release();
    }

    const ops = await operatorById();
    // Only the two unset section boundaries are backfilled, to AND ("0").
    expect(ops.get(441)).toBe('0');
    expect(ops.get(456)).toBe('0');
    // First-of-group nulls and explicit operators are untouched.
    expect(ops.get(439)).toBeNull();
    expect(ops.get(453)).toBeNull();
    expect(ops.get(440)).toBe(0);
    expect(ops.get(454)).toBe('0');

    const logFn = (migration as unknown as { logger: { log: jest.Mock } })
      .logger.log;
    const summary = logFn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(summary).toContain('Movies Leaving Soon');
    expect(summary).toContain('TV Leaving Soon');
    expect(summary).toMatch(/2 rules in 2 rule groups/);
  });
});
