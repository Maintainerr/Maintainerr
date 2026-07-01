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
import { RULE_EVALUATION_CONCURRENCY } from '../constants/rules.constants';
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

  const waitForCondition = async (check: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 25; attempt++) {
      if (check()) {
        return;
      }

      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    throw new Error('Condition was not met in time');
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

  // Unary EXISTS/NOT_EXISTS must distinguish the getter's `null` (definitive
  // absence — e.g. lastViewedAt for a never-watched item) from `undefined`
  // (outer-catch transport failure in plex/seerr-getter). Without the
  // tightened shouldCompare, `!hasExistsValue(undefined) === true` would
  // spuriously add items on every transient API blip (#1446).
  describe('unary EXISTS contract on null vs undefined', () => {
    it('keeps NOT_EXISTS matching when firstVal is null (definitive absence)', async () => {
      // Locks the existing semantic against the new shouldCompare branch.
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
    });

    it('skips unary NOT_EXISTS on transient undefined so the item is not spuriously added', async () => {
      const mediaItem = createSingleMedia();
      const rules = [
        createStoredRule(1, {
          operator: null,
          action: RulePossibility.NOT_EXISTS,
          firstVal: [Application.PLEX, 6],
          section: 0,
        }),
      ];

      mockGetterSequence(undefined);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [mediaItem],
      );

      expect(result.data).toEqual([]);
    });

    it('completes the run and logs a skip (not a crash) when a unary rule value is unavailable', async () => {
      // getCustomValueIdentifier dereferences customValue.ruleTypeId. A unary
      // rule (EXISTS/NOT_EXISTS) carries no customVal, so logging the skipped
      // comparison must not reach this helper — otherwise the run threw
      // "Cannot read properties of undefined (reading 'ruleTypeId')" and aborted.
      ruleConstanstService.getCustomValueIdentifier.mockImplementation(
        (customValue: { ruleTypeId: number; value: string }) => ({
          type: ['number', 'date', 'text', 'boolean', 'text list'][
            customValue.ruleTypeId
          ],
          value: customValue.value,
        }),
      );

      const mediaItem = createSingleMedia();
      const rules = [
        createStoredRule(1, {
          operator: null,
          action: RulePossibility.NOT_EXISTS,
          firstVal: [Application.PLEX, 6],
          section: 0,
        }),
      ];

      mockGetterSequence(undefined);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [mediaItem],
      );

      // The run completes (the bug aborted via the catch and returned undefined),
      expect(result).toBeDefined();
      // the item is not matched,
      expect(result.data).toEqual([]);
      // and the skip is logged rather than crashing the run.
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          'Skipping rule comparison because a value is unavailable',
        ),
      );
      expect(logger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Something went wrong'),
      );
    });
  });

  describe('OR sections', () => {
    // section 0: viewCount EQUALS 0  (operator: null = OR boundary)
    // section 1: viewCount BIGGER 0  (operator: null = OR boundary)
    // These two conditions are mutually exclusive, which proves OR semantics —
    // if AND were used, no item could satisfy both simultaneously.
    //
    // Field [Application.PLEX, 5] = viewCount
    // RulePossibility.EQUALS = 2, RulePossibility.BIGGER = 0
    // operator null  = first condition of a new OR section
    // operator RuleOperators.AND (0) = AND within a section

    const buildTwoSectionRules = () => [
      createStoredRule(
        1,
        {
          operator: null,
          action: RulePossibility.EQUALS,
          firstVal: [Application.PLEX, 5],
          customVal: { ruleTypeId: +RuleType.NUMBER, value: '0' },
          section: 0,
        },
        0,
      ),
      createStoredRule(
        2,
        {
          operator: null,
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 5],
          customVal: { ruleTypeId: +RuleType.NUMBER, value: '0' },
          section: 1,
        },
        1,
      ),
    ];

    it('includes an item matching only section 0 (mutually exclusive sections prove OR not AND)', async () => {
      // viewCount = 0 matches section 0 (EQUALS 0) but not section 1 (BIGGER 0)
      const mediaItem = createSingleMedia();
      const rules = buildTwoSectionRules();

      // getter called twice per item: first for section 0 rule, then for section 1 rule
      mockGetterSequence(0, 0);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [mediaItem],
      );

      expect(result.data).toHaveLength(1);
      expect(result.stats[0].result).toBe(true);
    });

    it('includes an item matching only section 1', async () => {
      // viewCount = 5 does not match section 0 (EQUALS 0) but does match section 1 (BIGGER 0)
      const mediaItem = createSingleMedia();
      const rules = buildTwoSectionRules();

      mockGetterSequence(5, 5);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [mediaItem],
      );

      expect(result.data).toHaveLength(1);
      expect(result.stats[0].result).toBe(true);
    });

    it('excludes an item matching neither section', async () => {
      // viewCount = null matches neither EQUALS 0 nor BIGGER 0
      const mediaItem = createSingleMedia();
      const rules = buildTwoSectionRules();

      mockGetterSequence(null, null);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [mediaItem],
      );

      expect(result.data).toEqual([]);
      expect(result.stats[0].result).toBe(false);
    });

    it('includes an item matching both overlapping sections exactly once (no duplicate)', async () => {
      // Overlapping (non-exclusive) sections so a single item can satisfy both:
      //   section 0: viewCount EQUALS 0
      //   section 1: viewCount SMALLER 1
      // An item with viewCount = 0 matches both sections. OR semantics must
      // union the sections and dedupe, so the item appears exactly once — a
      // regression here (e.g. pushing per matching section) would yield two.
      const overlappingRules = [
        createStoredRule(
          1,
          {
            operator: null,
            action: RulePossibility.EQUALS,
            firstVal: [Application.PLEX, 5],
            customVal: { ruleTypeId: +RuleType.NUMBER, value: '0' },
            section: 0,
          },
          0,
        ),
        createStoredRule(
          2,
          {
            operator: null,
            action: RulePossibility.SMALLER,
            firstVal: [Application.PLEX, 5],
            customVal: { ruleTypeId: +RuleType.NUMBER, value: '1' },
            section: 1,
          },
          1,
        ),
      ];
      const mediaItem = createSingleMedia();

      // viewCount = 0 for both the section 0 and section 1 evaluations
      mockGetterSequence(0, 0);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules: overlappingRules }),
        [mediaItem],
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('media-1');
      expect(result.stats[0].result).toBe(true);
    });

    it('short-circuits later OR rules for items that already matched earlier rules in the same section', async () => {
      const rules = [
        createStoredRule(
          1,
          {
            operator: null,
            action: RulePossibility.EQUALS,
            firstVal: [Application.PLEX, 5],
            customVal: { ruleTypeId: +RuleType.NUMBER, value: '1' },
            section: 0,
          },
          0,
        ),
        createStoredRule(
          2,
          {
            operator: RuleOperators.OR,
            action: RulePossibility.EQUALS,
            firstVal: [Application.PLEX, 5],
            customVal: { ruleTypeId: +RuleType.NUMBER, value: '2' },
            section: 0,
          },
          0,
        ),
      ];
      const matchedByFirstRule = createMediaItem({
        id: 'matched-first',
        type: 'movie' as const,
      });
      const matchedBySecondRule = createMediaItem({
        id: 'matched-second',
        type: 'movie' as const,
      });

      mockGetterSequence(1, 0, 2);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [matchedByFirstRule, matchedBySecondRule],
      );

      expect(result.data.map((item) => item.id).sort()).toEqual([
        'matched-first',
        'matched-second',
      ]);
      expect(valueGetterService.get).toHaveBeenCalledTimes(3);
      expect(
        result.stats.find((stat) => stat.mediaServerId === 'matched-first')
          ?.sectionResults[0].ruleResults,
      ).toHaveLength(1);
      expect(
        result.stats.find((stat) => stat.mediaServerId === 'matched-second')
          ?.sectionResults[0].ruleResults,
      ).toHaveLength(2);
    });

    it('honours an explicit AND section operator (intersection), not OR', async () => {
      // The section operator is persisted as a string. An explicit AND is "0",
      // so the section combine must use null-guarded coercion: +"0" === 0.
      // A naive strict comparison ("0" === 0) would be false and silently
      // turn the section into OR, including items that match only one section.
      //   section 0: viewCount BIGGER 0        (operator null = first section)
      //   section 1: viewCount SMALLER 10      (operator "0" = AND)
      const andRules = [
        createStoredRule(
          1,
          {
            operator: null,
            action: RulePossibility.BIGGER,
            firstVal: [Application.PLEX, 5],
            customVal: { ruleTypeId: +RuleType.NUMBER, value: '0' },
            section: 0,
          },
          0,
        ),
        createStoredRule(
          2,
          {
            // Persisted as a string by the UI (RuleDto types it loosely as the
            // enum, but the stored value is "0"/"1"); cast to match real data.
            operator: '0' as unknown as RuleOperators,
            action: RulePossibility.SMALLER,
            firstVal: [Application.PLEX, 5],
            customVal: { ruleTypeId: +RuleType.NUMBER, value: '10' },
            section: 1,
          },
          1,
        ),
      ];
      const inRange = createMediaItem({
        id: 'in-range',
        type: 'movie' as const,
      });
      const tooHigh = createMediaItem({
        id: 'too-high',
        type: 'movie' as const,
      });

      // getter order: section 0 over [inRange, tooHigh], then section 1 over
      // [inRange, tooHigh]. viewCount: inRange = 5, tooHigh = 15.
      mockGetterSequence(5, 15, 5, 15);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules: andRules }),
        [inRange, tooHigh],
      );

      // AND: only inRange satisfies both (>0 and <10). tooHigh (>0 but not <10)
      // is excluded. Under the OR regression both would be included.
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('in-range');
    });
  });

  describe('transientFailureMediaIds', () => {
    it('tracks firstVal undefined as a transient failure', async () => {
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

      mockGetterSequence(undefined);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [mediaItem],
      );

      expect(result.transientFailureMediaIds.has('media-1')).toBe(true);
    });

    it('does not track firstVal null as a transient failure', async () => {
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

      expect(result.transientFailureMediaIds.has('media-1')).toBe(false);
    });

    it('tracks secondVal undefined when rule.lastVal is used', async () => {
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

      mockGetterSequence(10, undefined);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [mediaItem],
      );

      expect(result.transientFailureMediaIds.has('media-1')).toBe(true);
    });

    it('does not track customVal comparisons as second-value transients', async () => {
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

      mockGetterSequence(5);

      const result = await ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        [mediaItem],
      );

      expect(result.transientFailureMediaIds.has('media-1')).toBe(false);
    });
  });

  describe('rule evaluation batching', () => {
    it('resolves operand reads in batches capped by RULE_EVALUATION_CONCURRENCY', async () => {
      const mediaItems = Array.from(
        { length: RULE_EVALUATION_CONCURRENCY + 2 },
        (_, index) =>
          createMediaItem({
            id: `media-${index + 1}`,
            type: 'movie' as const,
          }),
      );
      const rules = [
        createStoredRule(1, {
          operator: null,
          action: RulePossibility.EXISTS,
          firstVal: [Application.PLEX, 8],
          section: 0,
        }),
      ];

      let inFlight = 0;
      let maxInFlight = 0;
      let startedCalls = 0;
      const resolvers: Array<() => void> = [];

      valueGetterService.get.mockImplementation(
        () =>
          new Promise((resolve) => {
            startedCalls++;
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            resolvers.push(() => {
              inFlight--;
              resolve('present');
            });
          }) as never,
      );

      const resultPromise = ruleComparatorService.executeRulesWithData(
        createRulesDto({ dataType: 'movie', rules }),
        mediaItems,
      );

      await waitForCondition(
        () => startedCalls === RULE_EVALUATION_CONCURRENCY,
      );
      expect(maxInFlight).toBe(RULE_EVALUATION_CONCURRENCY);
      expect(startedCalls).toBe(RULE_EVALUATION_CONCURRENCY);

      resolvers.splice(0).forEach((resolve) => resolve());

      await waitForCondition(
        () => startedCalls === RULE_EVALUATION_CONCURRENCY + 2,
      );
      expect(maxInFlight).toBe(RULE_EVALUATION_CONCURRENCY);

      resolvers.splice(0).forEach((resolve) => resolve());

      const result = await resultPromise;

      expect(result.data).toHaveLength(mediaItems.length);
      expect(valueGetterService.get).toHaveBeenCalledTimes(mediaItems.length);
    });
  });
});
