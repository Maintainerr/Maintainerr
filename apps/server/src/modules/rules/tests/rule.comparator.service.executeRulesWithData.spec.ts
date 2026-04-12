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
  const customDaysSeconds = (330 * 86400).toString();

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
    ruleConstanstService.getValueNullReason.mockReturnValue(
      'Value unavailable',
    );
    ruleConstanstService.getRuleConstants.mockReturnValue({
      applications: [
        {
          id: Application.PLEX,
          name: 'Plex',
          mediaType: 0,
          props: [
            {
              id: 31,
              name: 'imdb',
              type: RuleType.NUMBER,
              mediaType: 0,
              humanName: 'IMDb',
            },
            {
              id: 5,
              name: 'viewCount',
              type: RuleType.NUMBER,
              mediaType: 0,
              humanName: 'Times viewed',
            },
            {
              id: 6,
              name: 'lastViewedAt',
              type: RuleType.DATE,
              mediaType: 0,
              humanName: 'Last view date',
            },
            {
              id: 8,
              name: 'resolution',
              type: RuleType.TEXT,
              mediaType: 0,
              humanName: 'Resolution',
            },
            {
              id: 10,
              name: 'codec',
              type: RuleType.TEXT,
              mediaType: 0,
              humanName: 'Codec',
            },
          ],
        },
        {
          id: Application.JELLYFIN,
          name: 'Jellyfin',
          mediaType: 0,
          props: [
            {
              id: 0,
              name: 'lastViewedAt',
              type: RuleType.DATE,
              mediaType: 0,
              humanName: 'Last view date',
            },
          ],
        },
      ],
    } as never);
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
      firstValueReason: 'Value unavailable',
      secondValue: 6,
      result: false,
    });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping rule comparison because a value is unavailable',
      ),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('ruleGroup="'),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('section=0'),
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
      secondValueReason: 'Value unavailable',
      result: true,
    });
  });

  it('matches exists rules when the first value is present without a second operand', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.EXISTS,
        firstVal: [Application.PLEX, 8],
        section: 0,
      }),
    ];

    mockGetterSequence('HEVC 1080p');

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    expect(result.data).toHaveLength(1);
    expect(result.stats[0].result).toBe(true);
    expect(result.stats[0].sectionResults[0].ruleResults[0]).toMatchObject({
      action: 'exists',
      firstValue: 'HEVC 1080p',
      result: true,
    });
    expect(result.stats[0].sectionResults[0].ruleResults[0]).not.toHaveProperty(
      'secondValue',
    );
    expect(result.stats[0].sectionResults[0].ruleResults[0]).not.toHaveProperty(
      'secondValueName',
    );
    expect(valueGetterService.get).toHaveBeenCalledTimes(1);
  });

  it('matches not_exists rules when the first value is missing', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.NOT_EXISTS,
        firstVal: [Application.PLEX, 6],
        section: 0,
      }),
    ];

    mockGetterSequence(null);

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    expect(result.data).toHaveLength(1);
    expect(result.stats[0].result).toBe(true);
    expect(result.stats[0].sectionResults[0].ruleResults[0]).toMatchObject({
      action: 'not_exists',
      firstValue: null,
      firstValueReason: 'Value unavailable',
      result: true,
    });
    expect(result.stats[0].sectionResults[0].ruleResults[0]).not.toHaveProperty(
      'secondValue',
    );
    expect(result.stats[0].sectionResults[0].ruleResults[0]).not.toHaveProperty(
      'secondValueName',
    );
  });

  it('keeps BEFORE date rules fail-closed when lastViewedAt is null', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.BEFORE,
        firstVal: [Application.PLEX, 6],
        customVal: {
          ruleTypeId: +RuleType.DATE,
          value: '2024-01-01T00:00:00.000Z',
        },
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
      action: 'before',
      firstValue: null,
      firstValueReason: 'Value unavailable',
      result: false,
    });
    expect(
      result.stats[0].sectionResults[0].ruleResults[0].secondValue,
    ).toEqual(new Date('2024-01-01T00:00:00.000Z'));
  });

  it('formats custom_days second value as a past Date when first value is null (issue #2582)', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.BEFORE,
        firstVal: [Application.JELLYFIN, 0],
        customVal: { ruleTypeId: +RuleType.NUMBER, value: customDaysSeconds },
        section: 0,
      }),
    ];

    mockGetterSequence(null);

    const startedAt = Date.now();

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    const completedAt = Date.now();
    const secondValue = result.stats[0].sectionResults[0].ruleResults[0]
      .secondValue as Date;

    expect(result.stats[0].sectionResults[0].ruleResults[0].result).toBe(false);
    expect(secondValue).toBeInstanceOf(Date);
    expect(secondValue.getTime()).toBeGreaterThanOrEqual(
      startedAt - +customDaysSeconds * 1000,
    );
    expect(secondValue.getTime()).toBeLessThanOrEqual(
      completedAt - +customDaysSeconds * 1000,
    );
  });

  it('keeps numeric custom values numeric for non-date rules when first value is null', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.EQUALS,
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

    expect(result.stats[0].sectionResults[0].ruleResults[0]).toMatchObject({
      firstValue: null,
      secondValue: 6,
      result: false,
    });
  });

  it('formats custom_days second value as a future Date for equality date rules when first value is null', async () => {
    const mediaItem = createSingleMedia();
    const rules = [
      createStoredRule(1, {
        operator: null,
        action: RulePossibility.EQUALS,
        firstVal: [Application.PLEX, 6],
        customVal: { ruleTypeId: +RuleType.NUMBER, value: customDaysSeconds },
        section: 0,
      }),
    ];

    mockGetterSequence(null);

    const startedAt = Date.now();

    const result = await ruleComparatorService.executeRulesWithData(
      createRulesDto({ dataType: 'movie', rules }),
      [mediaItem],
    );

    const completedAt = Date.now();
    const secondValue = result.stats[0].sectionResults[0].ruleResults[0]
      .secondValue as Date;

    expect(secondValue).toBeInstanceOf(Date);
    expect(secondValue.getTime()).toBeGreaterThanOrEqual(
      startedAt + +customDaysSeconds * 1000,
    );
    expect(secondValue.getTime()).toBeLessThanOrEqual(
      completedAt + +customDaysSeconds * 1000,
    );
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
