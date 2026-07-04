import { Mocked, TestBed } from '@suites/unit';
import YAML from 'yaml';
import { RuleConstanstService } from '../constants/constants.service';
import { RuleOperators, RulePossibility } from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RuleYamlService } from './yaml.service';

describe('RuleYamlService', () => {
  let service: RuleYamlService;
  let ruleConstants: Mocked<RuleConstanstService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(RuleYamlService).compile();
    service = unit;
    ruleConstants = unitRef.get(RuleConstanstService);

    ruleConstants.getValueIdentifier.mockReturnValue('Plex.viewCount');
    ruleConstants.getValueFromIdentifier.mockReturnValue([0, 5]);
  });

  // A two-section rule whose section-1 boundary uses an explicit AND operator.
  // YAML imports persist operators numerically, so AND is the number 0 - which
  // is falsy and used to be dropped on export.
  const twoSectionRules = (sectionOperator: RuleDto['operator']): RuleDto[] => [
    {
      operator: null,
      action: RulePossibility.EQUALS,
      firstVal: [0, 5],
      section: 0,
    },
    {
      operator: sectionOperator,
      action: RulePossibility.BIGGER,
      firstVal: [0, 5],
      section: 1,
    },
  ];

  it('exports a numeric AND (0) section operator instead of dropping it', () => {
    const result = service.encode(
      twoSectionRules(0 as unknown as RuleDto['operator']),
      'movie',
    );

    expect(result.code).toBe(1);
    const parsed = YAML.parse(result.result as string);
    // rules is an array of { [sectionId]: rule[] }; section 1 is the 2nd entry.
    expect(parsed.rules[1]['1'][0].operator).toBe('AND');
  });

  it('omits the operator for a first-of-section rule when it is null', () => {
    const result = service.encode(twoSectionRules(null), 'movie');

    const parsed = YAML.parse(result.result as string);
    expect(parsed.rules[0]['0'][0]).not.toHaveProperty('operator');
  });

  it('round-trips an AND section operator through encode + decode', () => {
    const encoded = service.encode(
      twoSectionRules(0 as unknown as RuleDto['operator']),
      'movie',
    );
    const decoded = service.decode(encoded.result as string, 'movie');

    expect(decoded.code).toBe(1);
    const rules: RuleDto[] = JSON.parse(decoded.result as string).rules;
    // Section-1 boundary rule keeps AND (decoded numerically as RuleOperators.AND = 0).
    expect(rules[1].operator).toBe(0);
    expect(rules[1].section).toBe(1);
  });

  it('normalizes missing non-first operators during decode', () => {
    const encoded = service.encode(
      [
        {
          operator: null,
          action: RulePossibility.EQUALS,
          firstVal: [0, 5],
          section: 0,
        },
        {
          operator: RuleOperators.OR,
          action: RulePossibility.BIGGER,
          firstVal: [0, 5],
          section: 0,
        },
        {
          operator: RuleOperators.AND,
          action: RulePossibility.SMALLER,
          firstVal: [0, 5],
          section: 1,
        },
      ],
      'movie',
    );
    const legacyYamlShape = YAML.parse(encoded.result as string);
    delete legacyYamlShape.rules[0]['0'][1].operator;
    delete legacyYamlShape.rules[1]['1'][0].operator;
    const legacyYaml = YAML.stringify(legacyYamlShape);

    const decoded = service.decode(legacyYaml, 'movie');

    expect(decoded.code).toBe(1);
    const rules: RuleDto[] = JSON.parse(decoded.result as string).rules;
    expect(rules.map((rule) => rule.operator)).toEqual([
      null,
      RuleOperators.OR,
      RuleOperators.AND,
    ]);
  });

  it('skips a rule with an unresolved property on export instead of emitting App.undefined', () => {
    // Second rule references a property that no longer resolves.
    ruleConstants.getValueIdentifier.mockImplementation(
      (loc: [number, number]) => (loc[1] === 99 ? null : 'Plex.viewCount'),
    );

    const result = service.encode(
      [
        {
          operator: null,
          action: RulePossibility.EQUALS,
          firstVal: [0, 5],
          section: 0,
        },
        {
          operator: RuleOperators.OR,
          action: RulePossibility.BIGGER,
          firstVal: [0, 99],
          section: 0,
        },
      ],
      'movie',
    );

    expect(result.code).toBe(1);
    expect(result.skipped).toBe(1); // surfaced to the user on export
    const yaml = result.result as string;
    expect(yaml).not.toContain('undefined'); // no `App.undefined`
    const parsed = YAML.parse(yaml);
    expect(parsed.rules[0]['0']).toHaveLength(1); // unresolved rule omitted
  });

  it('skips a rule with an unresolved identifier on import instead of failing the whole document', () => {
    // First rule resolves, second does not.
    ruleConstants.getValueFromIdentifier.mockImplementation(
      (identifier: string) =>
        identifier.includes('gone') ? null : ([0, 5] as [number, number]),
    );

    const yaml = YAML.stringify({
      mediaType: 'MOVIES',
      rules: [
        {
          0: [
            { firstValue: 'Plex.viewCount', action: 'EQUALS' },
            { operator: 'OR', firstValue: 'Plex.gone', action: 'BIGGER' },
          ],
        },
      ],
    });

    const decoded = service.decode(yaml, 'movie');

    expect(decoded.code).toBe(1); // not a whole-document failure
    expect(decoded.skipped).toBe(1); // surfaced (top-level) to the user on import
    const parsed = JSON.parse(decoded.result as string);
    expect(parsed.rules).toHaveLength(1); // the unresolved rule was skipped
    expect(parsed.rules[0].firstVal).toEqual([0, 5]);
  });

  it('gives the section-boundary AND default to the first surviving rule when an earlier one is skipped', () => {
    ruleConstants.getValueFromIdentifier.mockImplementation(
      (identifier: string) =>
        identifier.includes('gone') ? null : ([0, 5] as [number, number]),
    );

    const yaml = YAML.stringify({
      mediaType: 'MOVIES',
      rules: [
        { 0: [{ firstValue: 'Plex.viewCount', action: 'EQUALS' }] },
        {
          1: [
            // First rule of section 1 is unresolved -> skipped. The next rule
            // (no explicit operator) is now the section boundary and must
            // default to AND, not OR.
            { firstValue: 'Plex.gone', action: 'BIGGER' },
            { firstValue: 'Plex.viewCount', action: 'BIGGER' },
          ],
        },
      ],
    });

    const decoded = service.decode(yaml, 'movie');
    const rules: RuleDto[] = JSON.parse(decoded.result as string).rules;

    expect(rules.map((r) => r.section)).toEqual([0, 1]);
    expect(rules[0].operator).toBeNull(); // first rule of the group
    expect(rules[1].operator).toBe(RuleOperators.AND); // section boundary, not OR
  });

  it('returns a clear, structured message when the YAML is not valid', () => {
    // Malformed YAML (an unterminated flow sequence) makes the parser throw,
    // which the decoder catches and reports as a structured failure.
    const decoded = service.decode('rules: [unterminated', 'movie');

    expect(decoded.code).toBe(0);
    expect(decoded.message).toBe(
      'Validation failed - Please check your YAML structure.',
    );
  });
});
