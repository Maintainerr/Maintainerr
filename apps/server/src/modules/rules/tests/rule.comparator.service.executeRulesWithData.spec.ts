import { Mocked, TestBed } from '@suites/unit';
import { createMediaItem, createRulesDto } from '../../../../test/utils/data';
import { MaintainerrLogger } from '../../logging/logs.service';
import { RuleConstanstService } from '../constants/constants.service';
import {
  Application,
  RuleOperators,
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

  it('fails closed for null numeric values in AND rules', async () => {
    const mediaItem = createMediaItem({ id: 'media-1', type: 'movie' });
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.EQUALS,
        firstVal: [Application.PLEX, 5],
        customVal: { ruleTypeId: +RuleType.NUMBER, value: '0' },
        section: 0,
      }),
      createStoredRule(2, {
        operator: RuleOperators.AND,
        action: RulePossibility.SMALLER,
        firstVal: [Application.PLEX, 31],
        customVal: { ruleTypeId: +RuleType.NUMBER, value: '6' },
        section: 0,
      }),
    ];

    valueGetterService.get.mockResolvedValueOnce(0).mockResolvedValueOnce(null);

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    expect(result.data).toEqual([]);
    expect(result.stats).toHaveLength(1);
    expect(result.stats[0].sectionResults[0].ruleResults).toHaveLength(2);
    expect(result.stats[0].sectionResults[0].ruleResults[1]).toMatchObject({
      action: 'smaller',
      firstValue: null,
      secondValue: 6,
      result: false,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping rule comparison due to missing operand: mediaId=media-1',
      ),
    );
  });

  it('fails closed for BEFORE when lastViewedAt is null', async () => {
    const mediaItem = createMediaItem({ id: 'media-1', type: 'movie' });
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.BEFORE,
        firstVal: [Application.JELLYFIN, 4],
        customVal: { ruleTypeId: +RuleType.NUMBER, value: '5184000' },
        section: 0,
      }),
    ];

    ruleConstanstService.getValueHumanName.mockReturnValue(
      'Jellyfin - Last view date',
    );
    ruleConstanstService.getCustomValueIdentifier.mockReturnValue({
      type: 'custom_days',
      value: '60',
    });
    valueGetterService.get.mockResolvedValueOnce(null);

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    expect(result.data).toEqual([]);
    expect(result.stats[0].sectionResults[0].ruleResults[0]).toMatchObject({
      action: 'before',
      firstValue: null,
      secondValue: 5184000,
      result: false,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping rule comparison due to missing operand',
      ),
    );
  });
});
