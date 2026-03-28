import { Mocked, TestBed } from '@suites/unit';
import { createMediaItem, createRulesDto } from '../../../../test/utils/data';
import { MaintainerrLogger } from '../../logging/logs.service';
import { RuleConstanstService } from '../constants/constants.service';
import {
  Application,
  RulePossibility,
  RuleType,
} from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RuleDbDto } from '../dtos/ruleDb.dto';
import { ValueGetterService } from '../getter/getter.service';
import { RuleComparatorService } from '../helpers/rule.comparator.service';

const createStoredRule = (
  id: number,
  rule: RuleDto,
  section = 0,
): RuleDbDto => ({
  id,
  isActive: true,
  ruleGroupId: 1,
  ruleJson: JSON.stringify(rule),
  section,
});

describe('RuleComparatorService.executeRulesWithData', () => {
  let ruleComparatorService: RuleComparatorService;
  let valueGetterService: Mocked<ValueGetterService>;
  let ruleConstanstService: Mocked<RuleConstanstService>;
  let logger: Mocked<MaintainerrLogger>;

  const createSingleMedia = () =>
    createMediaItem({ id: 'media-1', type: 'movie' as const });

  const mockGetterSequence = (...values: unknown[]) => {
    valueGetterService.get.mockReset();
    values.forEach((value) => {
      valueGetterService.get.mockResolvedValueOnce(value as never);
    });
  };

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      RuleComparatorService,
    ).compile();

    ruleComparatorService = unit;
    valueGetterService = unitRef.get(ValueGetterService);
    ruleConstanstService = unitRef.get(RuleConstanstService);
    logger = unitRef.get(MaintainerrLogger);

    ruleConstanstService.getValueHumanName.mockReturnValue(
      'Plex - IMDb rating (scale 1-10)',
    );
    ruleConstanstService.getCustomValueIdentifier.mockReturnValue({
      type: 'number',
      value: 6,
    });
  });

  it('fails closed when the first value is missing for a custom comparison', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.SMALLER,
        firstVal: [Application.PLEX, 31],
        customVal: { ruleTypeId: +RuleType.NUMBER, value: '6' },
        section: 0,
      }),
    ];

    mockGetterSequence(null);

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    expect(result.data).toEqual([]);
    expect(result.stats[0].result).toBe(false);
    expect(result.stats[0].sectionResults[0].ruleResults[0]).toMatchObject({
      action: 'smaller',
      firstValue: null,
      secondValue: 6,
      result: false,
    });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping rule comparison due to missing operand',
      ),
    );
  });

  it('preserves 3.1.0 numeric lastVal behavior when the second value is missing', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.BIGGER,
        firstVal: [Application.PLEX, 5],
        lastVal: [Application.PLEX, 6],
        section: 0,
      }),
    ];

    mockGetterSequence(10, null);

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    expect(result.data).toHaveLength(1);
    expect(result.stats[0].result).toBe(true);
    expect(result.stats[0].sectionResults[0].result).toBe(true);
    expect(result.stats[0].sectionResults[0].ruleResults[0]).toMatchObject({
      action: 'bigger',
      firstValue: 10,
      secondValue: null,
      result: true,
    });
  });

  it('preserves 3.1.0 text lastVal behavior when the second value is missing', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.NOT_CONTAINS,
        firstVal: [Application.PLEX, 8],
        lastVal: [Application.PLEX, 10],
        section: 0,
      }),
    ];

    mockGetterSequence('HEVC 1080p', null);

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    expect(result.data).toHaveLength(1);
    expect(result.stats[0].result).toBe(true);
    expect(result.stats[0].sectionResults[0].result).toBe(true);
    expect(result.stats[0].sectionResults[0].ruleResults[0]).toMatchObject({
      action: 'not_contains',
      firstValue: 'HEVC 1080p',
      secondValue: null,
      result: true,
    });
  });
});
