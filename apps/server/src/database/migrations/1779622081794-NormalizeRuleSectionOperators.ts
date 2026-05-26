import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills the `operator` field of stored rules that were saved without an
 * explicit AND/OR choice (operator === null).
 *
 * The docs state an operator is required from the second rule/section onwards,
 * but the UI never enforced it, so older rules can carry a null operator. The
 * comparator then inferred a value, and because `+null === 0` is true an unset
 * section operator was wrongly treated as AND.
 *
 * To change behaviour as little as possible, this migration writes back the
 * value each rule *already evaluates as today*, so no existing rule changes
 * how it matches:
 *   - first rule of a later section -> "0" (AND)  — the section-combine default
 *   - any other (within-section) rule -> "1" (OR) — the within-section default
 *   - the first rule of a group keeps null; its operator is forced to null at
 *     runtime regardless, so it is left untouched.
 * Making these explicit also stops the engine from re-inferring the value and
 * keeps the UI's "operator is required" guard from flagging existing rules.
 *
 * Rules are ordered by id, which is how they are (re)written on every save and
 * how the comparator iterates them, so the first id seen for a new section is
 * that section's first rule — the same boundary the comparator uses.
 *
 * Operators are written as strings ("0"/"1") to match the values the UI
 * persists; the comparator coerces with `+`, so string and numeric operators
 * are treated identically.
 */
export class NormalizeRuleSectionOperators1779622081794 implements MigrationInterface {
  private readonly logger = new Logger(
    NormalizeRuleSectionOperators1779622081794.name,
  );

  // Logging is purely informational; it must never be able to abort the
  // migration (and roll back its transaction), so any logger failure is
  // swallowed.
  private safeLog(write: () => void): void {
    try {
      write();
    } catch {
      // ignore — never let a log line break a migration
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{
      id: number;
      ruleGroupId: number;
      section: number;
      ruleJson: string;
    }> = await queryRunner.manager
      .createQueryBuilder()
      .select('rule.id', 'id')
      .addSelect('rule.ruleGroupId', 'ruleGroupId')
      .addSelect('rule.section', 'section')
      .addSelect('rule.ruleJson', 'ruleJson')
      .from('rules', 'rule')
      .orderBy('rule.ruleGroupId', 'ASC')
      .addOrderBy('rule.id', 'ASC')
      .getRawMany();

    // Rule group names for human-readable logging — users know their groups by
    // name, not id. Best-effort: fall back to the id if the lookup fails.
    const groupNameById = new Map<number, string>();
    try {
      const groupRows: Array<{ id: number; name: string }> =
        await queryRunner.manager
          .createQueryBuilder()
          .select('rg.id', 'id')
          .addSelect('rg.name', 'name')
          .from('rule_group', 'rg')
          .getRawMany();
      for (const g of groupRows) groupNameById.set(g.id, g.name);
    } catch {
      // rule_group not queryable (e.g. isolated migration test) — log ids.
    }
    const nameOf = (id: number) => groupNameById.get(id) ?? `group ${id}`;

    let currentGroupId: number | null = null;
    let previousSection: number | null = null;
    let backfilled = 0;
    const affectedGroups = new Set<string>();

    for (const row of rows) {
      const isFirstRuleOfGroup = row.ruleGroupId !== currentGroupId;
      if (isFirstRuleOfGroup) {
        currentGroupId = row.ruleGroupId;
        previousSection = null;
      }

      const isFirstRuleOfSection = row.section !== previousSection;
      previousSection = row.section;

      // The first rule of a group has its operator forced to null at runtime.
      if (isFirstRuleOfGroup) {
        continue;
      }

      let parsed: { operator?: unknown };
      try {
        parsed = JSON.parse(row.ruleJson);
      } catch {
        // Leave unparseable rows untouched; they are not ours to fix here.
        continue;
      }

      // Only backfill rules that have no explicit operator.
      if (parsed.operator !== null && parsed.operator !== undefined) {
        continue;
      }

      // Preserve today's effective behaviour: a section boundary defaulted to
      // AND, a within-section rule defaulted to OR.
      parsed.operator = isFirstRuleOfSection ? '0' : '1';

      await queryRunner.manager
        .createQueryBuilder()
        .update('rules')
        .set({ ruleJson: JSON.stringify(parsed) })
        .where('id = :id', { id: row.id })
        .execute();

      backfilled += 1;
      affectedGroups.add(nameOf(row.ruleGroupId));
      this.safeLog(() =>
        this.logger.debug(
          `Rule group "${nameOf(row.ruleGroupId)}": a rule was missing its ` +
            `AND/OR setting — set it to ${isFirstRuleOfSection ? 'AND' : 'OR'} ` +
            `(the value it was already using).`,
        ),
      );
    }

    if (backfilled > 0) {
      const ruleWord = backfilled === 1 ? 'rule' : 'rules';
      const groupWord = affectedGroups.size === 1 ? 'group' : 'groups';
      this.safeLog(() =>
        this.logger.log(
          `Filled in a missing AND/OR setting on ${backfilled} ${ruleWord} in ` +
            `${affectedGroups.size} rule ${groupWord} ` +
            `(${[...affectedGroups].join(', ')}). These rules still match the ` +
            `same items as before.`,
        ),
      );
    }
  }

  public async down(): Promise<void> {
    // Data backfill only. The original null operators cannot be distinguished
    // from operators that were explicitly chosen, so this is not reversible.
    // Following the precedent of other data migrations (e.g. RemoveEmptyRules),
    // down() is intentionally a no-op.
  }
}
