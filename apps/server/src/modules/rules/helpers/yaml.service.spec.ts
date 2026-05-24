import { Mocked, TestBed } from '@suites/unit';
import YAML from 'yaml';
import { RuleConstanstService } from '../constants/constants.service';
import { RulePossibility } from '../constants/rules.constants';
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
  // YAML imports persist operators numerically, so AND is the number 0 — which
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
});
