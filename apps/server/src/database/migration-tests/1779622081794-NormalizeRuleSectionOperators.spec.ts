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

  it('backfills section boundaries and leaves explicit operators unchanged', async () => {
    await insertRule(1, 11, 0, null); // first of group -> stays null
    await insertRule(2, 11, 0, 0); // explicit numeric AND -> unchanged
    await insertRule(3, 11, 1, null); // section boundary -> backfill "0"
    await insertRule(4, 12, 0, null); // first of next group -> stays null
    await insertRule(5, 12, 0, '0'); // explicit string AND -> unchanged
    await insertRule(6, 12, 1, null); // section boundary -> backfill "0"

    await runMigration();

    const ops = await operatorById();
    expect(ops.get(1)).toBeNull();
    expect(ops.get(2)).toBe(0);
    expect(ops.get(3)).toBe('0');
    expect(ops.get(4)).toBeNull();
    expect(ops.get(5)).toBe('0');
    expect(ops.get(6)).toBe('0');
  });
});
