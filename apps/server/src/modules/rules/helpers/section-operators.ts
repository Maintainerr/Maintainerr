import { RuleOperators } from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';

/**
 * Re-assert each section's combine operator onto its first surviving rule.
 *
 * When rules are dropped on import (an unresolved YAML identifier, or a property
 * with no equivalent on the configured media server), a section's original first
 * rule may be gone. Without this the next surviving rule keeps its within-section
 * operator and silently becomes the section boundary, flipping the section
 * AND<->OR. Shared by the YAML decode and the cross-server migration import paths.
 *
 * @param rules surviving rules in section/order; mutated in place.
 * @param sectionCombineOp section -> the operator of that section's ORIGINAL
 *   first rule, captured before any rules were dropped.
 */
export function reassertSectionBoundaryOperators(
  rules: RuleDto[],
  sectionCombineOp: Map<number, RuleDto['operator']>,
): void {
  const seenSections = new Set<number>();

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (seenSections.has(rule.section)) continue;
    seenSections.add(rule.section);

    // The first rule of the whole group is always null. Every other section's
    // first surviving rule keeps that section's original combine operator,
    // defaulting to AND when it was unset (the section-combine default).
    const desired =
      i === 0
        ? null
        : (sectionCombineOp.get(rule.section) ?? RuleOperators.AND);

    if (rule.operator !== desired) {
      rules[i] = { ...rule, operator: desired };
    }
  }
}
