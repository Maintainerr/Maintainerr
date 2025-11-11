import { IComparisonStatistics } from '@maintainerr/contracts';
import { Mocked } from '@suites/doubles.jest';
import { TestBed } from '@suites/unit';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';
import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { RuleConstanstService } from '../constants/constants.service';
import {
  Application,
  RuleOperators,
  RulePossibility,
  RuleType,
} from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RuleDbDto } from '../dtos/ruleDb.dto';
import { RulesDto } from '../dtos/rules.dto';
import { ValueGetterService } from '../getter/getter.service';
import { RuleComparatorService } from '../helpers/rule.comparator.service';

describe('RuleComparatorService', () => {
  let ruleComparatorService: RuleComparatorService;
  let mockedValueGetterService: Mocked<ValueGetterService>;
  let mockedRuleConstanstService: Mocked<RuleConstanstService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      RuleComparatorService,
    ).compile();

    ruleComparatorService = unit;
    mockedValueGetterService = unitRef.get(ValueGetterService);
    mockedRuleConstanstService = unitRef.get(RuleConstanstService);
  });

  describe('executeRulesWithData', () => {
    it('should include media item for 4 sections, AND(true,false), OR(false), OR(true), AND(true)', async () => {
      const section0Rule1: RuleDto = {
        action: RulePossibility.EQUALS,
        section: 0,
        firstVal: [Application.OVERSEERR, 6] satisfies [number, number], // isRequested
        operator: RuleOperators.OR, // Should be forced to NULL
        customVal: {
          ruleTypeId: +RuleType.BOOL,
          value: '1',
        },
      };

      const section0Rule2: RuleDto = {
        action: RulePossibility.CONTAINS,
        section: 0,
        firstVal: [Application.OVERSEERR, 0] satisfies [number, number], // addUser
        operator: RuleOperators.AND,
        customVal: {
          ruleTypeId: +RuleType.TEXT,
          value: '["User"]',
        },
      };

      const section1Rule1: RuleDto = {
        action: RulePossibility.EQUALS,
        section: 1,
        firstVal: [Application.PLEX, 14] satisfies [number, number], // sw_episodes
        operator: RuleOperators.OR,
        lastVal: [Application.PLEX, 15] satisfies [number, number], // sw_viewedEpisodes
      };

      const section2Rule1: RuleDto = {
        action: RulePossibility.BIGGER,
        section: 2,
        firstVal: [Application.PLEX, 6] satisfies [number, number], // collections
        operator: RuleOperators.OR,
        customVal: {
          ruleTypeId: +RuleType.NUMBER,
          value: '0',
        },
      };

      const section3Rule1: RuleDto = {
        action: RulePossibility.BIGGER,
        section: 3,
        firstVal: [Application.PLEX, 5] satisfies [number, number], // viewCount
        operator: RuleOperators.AND,
        customVal: {
          ruleTypeId: +RuleType.NUMBER,
          value: '0',
        },
      };

      const ruleGroup: RulesDto = {
        id: 1,
        dataType: EPlexDataType.SHOWS,
        libraryId: 1,
        name: 'Test Rule Group',
        description: '',
        useRules: true,
        rules: [
          {
            id: 1,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule1),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
          {
            id: 2,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule2),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
          {
            id: 3,
            isActive: true,
            ruleJson: JSON.stringify(section1Rule1),
            ruleGroupId: 1,
            section: 1,
          } satisfies RuleDbDto,
          {
            id: 4,
            isActive: true,
            ruleJson: JSON.stringify(section2Rule1),
            ruleGroupId: 1,
            section: 2,
          } satisfies RuleDbDto,
          {
            id: 5,
            isActive: true,
            ruleJson: JSON.stringify(section3Rule1),
            ruleGroupId: 1,
            section: 3,
          } satisfies RuleDbDto,
        ],
      };

      const plexLibraryItem = {
        ratingKey: '12345',
      } as PlexLibraryItem; // We're not testing the actual data here so casting for simplicity

      const plexData: PlexLibraryItem[] = [plexLibraryItem];

      mockedValueGetterService.get.mockImplementation(
        ([val1, val2]: [number, number]) => {
          if (val1 === Application.OVERSEERR && val2 === 0) {
            return Promise.resolve([]);
          } else if (val1 === Application.OVERSEERR && val2 === 6) {
            return Promise.resolve(true);
          } else if (val1 === Application.PLEX && val2 === 14) {
            return Promise.resolve(3);
          } else if (val1 === Application.PLEX && val2 === 15) {
            return Promise.resolve(7);
          } else if (val1 === Application.PLEX && val2 === 6) {
            return Promise.resolve(2);
          } else if (val1 === Application.PLEX && val2 === 5) {
            return Promise.resolve(3);
          }

          throw new Error('Invalid test setup');
        },
      );

      mockedRuleConstanstService.getValueHumanName.mockReturnValue(
        'App - rule name',
      );
      mockedRuleConstanstService.getCustomValueIdentifier.mockReturnValue({
        type: 'custom value type',
        value: 'custom value',
      });

      const result = await ruleComparatorService.executeRulesWithData(
        ruleGroup,
        plexData,
      );

      // TODO Update rule.comparator to not return the same item more than once, then remove the unique filtering in rule-executor.
      expect(result.data).toEqual([plexLibraryItem]);
      expect(result.stats).toEqual([
        {
          plexId: 12345,
          result: true,
          sectionResults: [
            {
              id: 0,
              result: false,
              ruleResults: [
                {
                  action: 'equals',
                  firstValue: true,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 1,
                  secondValueName: 'custom value type',
                },
                {
                  action: 'contains',
                  firstValue: [],
                  firstValueName: 'App - rule name',
                  result: false,
                  secondValue: ['User'],
                  secondValueName: 'custom value type',
                  operator: 'AND',
                },
              ],
            },
            {
              id: 1,
              result: false,
              operator: 'OR',
              ruleResults: [
                {
                  action: 'equals',
                  firstValue: 3,
                  firstValueName: 'App - rule name',
                  result: false,
                  secondValue: 7,
                  secondValueName: 'App - rule name',
                },
              ],
            },
            {
              id: 2,
              result: true,
              operator: 'OR',
              ruleResults: [
                {
                  action: 'bigger',
                  firstValue: 2,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 0,
                  secondValueName: 'custom value type',
                },
              ],
            },
            {
              id: 3,
              result: true,
              operator: 'AND',
              ruleResults: [
                {
                  action: 'bigger',
                  firstValue: 3,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 0,
                  secondValueName: 'custom value type',
                },
              ],
            },
          ],
        } satisfies IComparisonStatistics,
      ]);
    });

    it('should include media item for 1 section, OR(false,true)', async () => {
      const section0Rule1: RuleDto = {
        action: RulePossibility.EQUALS,
        section: 0,
        firstVal: [Application.OVERSEERR, 6] satisfies [number, number], // isRequested
        operator: RuleOperators.OR, // Should be forced to NULL
        customVal: {
          ruleTypeId: +RuleType.BOOL,
          value: '1',
        },
      };

      const section0Rule2: RuleDto = {
        action: RulePossibility.BIGGER,
        section: 0,
        firstVal: [Application.PLEX, 5] satisfies [number, number], // viewCount
        operator: RuleOperators.OR,
        customVal: {
          ruleTypeId: +RuleType.NUMBER,
          value: '0',
        },
      };

      const ruleGroup: RulesDto = {
        id: 1,
        dataType: EPlexDataType.MOVIES,
        libraryId: 1,
        name: 'Test Rule Group',
        description: '',
        useRules: true,
        rules: [
          {
            id: 1,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule1),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
          {
            id: 2,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule2),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
        ],
      };

      const plexLibraryItem = {
        ratingKey: '12345',
      } as PlexLibraryItem; // We're not testing the actual data here so casting for simplicity

      const plexData: PlexLibraryItem[] = [plexLibraryItem];

      mockedValueGetterService.get.mockImplementation(
        ([val1, val2]: [number, number]) => {
          if (val1 === Application.OVERSEERR && val2 === 6) {
            return Promise.resolve(false);
          } else if (val1 === Application.PLEX && val2 === 5) {
            return Promise.resolve(1);
          }

          throw new Error('Invalid test setup');
        },
      );

      mockedRuleConstanstService.getValueHumanName.mockReturnValue(
        'App - rule name',
      );
      mockedRuleConstanstService.getCustomValueIdentifier.mockReturnValue({
        type: 'custom value type',
        value: 'custom value',
      });

      const result = await ruleComparatorService.executeRulesWithData(
        ruleGroup,
        plexData,
      );

      // TODO Update rule.comparator to not return the same item more than once, then remove the unique filtering in rule-executor.
      expect(result.data).toEqual([plexLibraryItem]);
      expect(result.stats).toEqual([
        {
          plexId: 12345,
          result: true,
          sectionResults: [
            {
              id: 0,
              result: true,
              ruleResults: [
                {
                  action: 'equals',
                  firstValue: false,
                  firstValueName: 'App - rule name',
                  result: false,
                  secondValue: 1,
                  secondValueName: 'custom value type',
                },
                {
                  action: 'bigger',
                  firstValue: 1,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 0,
                  secondValueName: 'custom value type',
                  operator: 'OR',
                },
              ],
            },
          ],
        } satisfies IComparisonStatistics,
      ]);
    });

    it('should include media item for 1 section, OR(true,false)', async () => {
      const section0Rule1: RuleDto = {
        action: RulePossibility.BIGGER,
        section: 0,
        firstVal: [Application.PLEX, 5] satisfies [number, number], // viewCount
        operator: RuleOperators.OR,
        customVal: {
          ruleTypeId: +RuleType.NUMBER,
          value: '0',
        },
      };

      const section0Rule2: RuleDto = {
        action: RulePossibility.EQUALS,
        section: 0,
        firstVal: [Application.OVERSEERR, 6] satisfies [number, number], // isRequested
        operator: RuleOperators.OR, // Should be forced to NULL
        customVal: {
          ruleTypeId: +RuleType.BOOL,
          value: '1',
        },
      };

      const ruleGroup: RulesDto = {
        id: 1,
        dataType: EPlexDataType.MOVIES,
        libraryId: 1,
        name: 'Test Rule Group',
        description: '',
        useRules: true,
        rules: [
          {
            id: 1,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule1),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
          {
            id: 2,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule2),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
        ],
      };

      const plexLibraryItem = {
        ratingKey: '12345',
      } as PlexLibraryItem; // We're not testing the actual data here so casting for simplicity

      const plexData: PlexLibraryItem[] = [plexLibraryItem];

      mockedValueGetterService.get.mockImplementation(
        ([val1, val2]: [number, number]) => {
          if (val1 === Application.OVERSEERR && val2 === 6) {
            return Promise.resolve(false);
          } else if (val1 === Application.PLEX && val2 === 5) {
            return Promise.resolve(1);
          }

          throw new Error('Invalid test setup');
        },
      );

      mockedRuleConstanstService.getValueHumanName.mockReturnValue(
        'App - rule name',
      );
      mockedRuleConstanstService.getCustomValueIdentifier.mockReturnValue({
        type: 'custom value type',
        value: 'custom value',
      });

      const result = await ruleComparatorService.executeRulesWithData(
        ruleGroup,
        plexData,
      );

      expect(result.data).toEqual([plexLibraryItem]);
      expect(result.stats).toEqual([
        {
          plexId: 12345,
          result: true,
          sectionResults: [
            {
              id: 0,
              result: true,
              ruleResults: [
                {
                  action: 'bigger',
                  firstValue: 1,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 0,
                  secondValueName: 'custom value type',
                },
                {
                  action: 'equals',
                  firstValue: false,
                  firstValueName: 'App - rule name',
                  result: false,
                  secondValue: 1,
                  secondValueName: 'custom value type',
                  operator: 'OR',
                },
              ],
            },
          ],
        } satisfies IComparisonStatistics,
      ]);
    });

    it('should not include media item for 1 section, AND(true,false)', async () => {
      const section0Rule1: RuleDto = {
        action: RulePossibility.EQUALS,
        section: 0,
        firstVal: [Application.OVERSEERR, 6] satisfies [number, number], // isRequested
        operator: RuleOperators.OR, // Should be forced to NULL
        customVal: {
          ruleTypeId: +RuleType.BOOL,
          value: '1',
        },
      };

      const section0Rule2: RuleDto = {
        action: RulePossibility.BIGGER,
        section: 0,
        firstVal: [Application.PLEX, 5] satisfies [number, number], // viewCount
        operator: RuleOperators.AND,
        customVal: {
          ruleTypeId: +RuleType.NUMBER,
          value: '0',
        },
      };

      const ruleGroup: RulesDto = {
        id: 1,
        dataType: EPlexDataType.MOVIES,
        libraryId: 1,
        name: 'Test Rule Group',
        description: '',
        useRules: true,
        rules: [
          {
            id: 1,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule1),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
          {
            id: 2,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule2),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
        ],
      };

      const plexLibraryItem = {
        ratingKey: '12345',
      } as PlexLibraryItem; // We're not testing the actual data here so casting for simplicity

      const plexData: PlexLibraryItem[] = [plexLibraryItem];

      mockedValueGetterService.get.mockImplementation(
        ([val1, val2]: [number, number]) => {
          if (val1 === Application.OVERSEERR && val2 === 6) {
            return Promise.resolve(true);
          } else if (val1 === Application.PLEX && val2 === 5) {
            return Promise.resolve(0);
          }

          throw new Error('Invalid test setup');
        },
      );

      mockedRuleConstanstService.getValueHumanName.mockReturnValue(
        'App - rule name',
      );
      mockedRuleConstanstService.getCustomValueIdentifier.mockReturnValue({
        type: 'custom value type',
        value: 'custom value',
      });

      const result = await ruleComparatorService.executeRulesWithData(
        ruleGroup,
        plexData,
      );

      expect(result.data).toEqual([]);
      expect(result.stats).toEqual([
        {
          plexId: 12345,
          result: false,
          sectionResults: [
            {
              id: 0,
              result: false,
              ruleResults: [
                {
                  action: 'equals',
                  firstValue: true,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 1,
                  secondValueName: 'custom value type',
                },
                {
                  action: 'bigger',
                  firstValue: 0,
                  firstValueName: 'App - rule name',
                  result: false,
                  secondValue: 0,
                  secondValueName: 'custom value type',
                  operator: 'AND',
                },
              ],
            },
          ],
        } satisfies IComparisonStatistics,
      ]);
    });

    it('should include media item for 1 section, AND(true,true)', async () => {
      const section0Rule1: RuleDto = {
        action: RulePossibility.EQUALS,
        section: 0,
        firstVal: [Application.OVERSEERR, 6] satisfies [number, number], // isRequested
        operator: RuleOperators.OR, // Should be forced to NULL
        customVal: {
          ruleTypeId: +RuleType.BOOL,
          value: '1',
        },
      };

      const section0Rule2: RuleDto = {
        action: RulePossibility.BIGGER,
        section: 0,
        firstVal: [Application.PLEX, 5] satisfies [number, number], // viewCount
        operator: RuleOperators.AND,
        customVal: {
          ruleTypeId: +RuleType.NUMBER,
          value: '0',
        },
      };

      const ruleGroup: RulesDto = {
        id: 1,
        dataType: EPlexDataType.MOVIES,
        libraryId: 1,
        name: 'Test Rule Group',
        description: '',
        useRules: true,
        rules: [
          {
            id: 1,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule1),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
          {
            id: 2,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule2),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
        ],
      };

      const plexLibraryItem = {
        ratingKey: '12345',
      } as PlexLibraryItem; // We're not testing the actual data here so casting for simplicity

      const plexData: PlexLibraryItem[] = [plexLibraryItem];

      mockedValueGetterService.get.mockImplementation(
        ([val1, val2]: [number, number]) => {
          if (val1 === Application.OVERSEERR && val2 === 6) {
            return Promise.resolve(true);
          } else if (val1 === Application.PLEX && val2 === 5) {
            return Promise.resolve(1);
          }

          throw new Error('Invalid test setup');
        },
      );

      mockedRuleConstanstService.getValueHumanName.mockReturnValue(
        'App - rule name',
      );
      mockedRuleConstanstService.getCustomValueIdentifier.mockReturnValue({
        type: 'custom value type',
        value: 'custom value',
      });

      const result = await ruleComparatorService.executeRulesWithData(
        ruleGroup,
        plexData,
      );

      expect(result.data).toEqual([plexLibraryItem]);
      expect(result.stats).toEqual([
        {
          plexId: 12345,
          result: true,
          sectionResults: [
            {
              id: 0,
              result: true,
              ruleResults: [
                {
                  action: 'equals',
                  firstValue: true,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 1,
                  secondValueName: 'custom value type',
                },
                {
                  action: 'bigger',
                  firstValue: 1,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 0,
                  secondValueName: 'custom value type',
                  operator: 'AND',
                },
              ],
            },
          ],
        } satisfies IComparisonStatistics,
      ]);
    });

    /***
     * Once a rule is marked as failed for a media item, that item should stop being processed and the remaining un-executed rules should not be included in the stats for it.
     */
    it('should not include media item when a getter fails (returned undefined)', async () => {
      const section0Rule1: RuleDto = {
        action: RulePossibility.EQUALS,
        section: 0,
        firstVal: [Application.OVERSEERR, 6] satisfies [number, number], // isRequested
        operator: RuleOperators.OR, // Should be forced to NULL
        customVal: {
          ruleTypeId: +RuleType.BOOL,
          value: '1',
        },
      };

      const section0Rule2: RuleDto = {
        action: RulePossibility.BIGGER,
        section: 0,
        firstVal: [Application.PLEX, 5] satisfies [number, number], // viewCount
        operator: RuleOperators.AND,
        customVal: {
          ruleTypeId: +RuleType.NUMBER,
          value: '0',
        },
      };

      const section1Rule1: RuleDto = {
        action: RulePossibility.EQUALS,
        section: 1,
        firstVal: [Application.OVERSEERR, 6] satisfies [number, number], // isRequested
        operator: RuleOperators.OR,
        customVal: {
          ruleTypeId: +RuleType.BOOL,
          value: '1',
        },
      };

      const ruleGroup: RulesDto = {
        id: 1,
        dataType: EPlexDataType.MOVIES,
        libraryId: 1,
        name: 'Test Rule Group',
        description: '',
        useRules: true,
        rules: [
          {
            id: 1,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule1),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
          {
            id: 2,
            isActive: true,
            ruleJson: JSON.stringify(section0Rule2),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
          {
            id: 3,
            isActive: true,
            ruleJson: JSON.stringify(section1Rule1),
            ruleGroupId: 1,
            section: 0,
          } satisfies RuleDbDto,
        ],
      };

      const plexLibraryItem = {
        ratingKey: '12345',
      } as PlexLibraryItem; // We're not testing the actual data here so casting for simplicity

      const plexData: PlexLibraryItem[] = [plexLibraryItem];

      mockedValueGetterService.get.mockImplementation(
        ([val1, val2]: [number, number]) => {
          if (val1 === Application.OVERSEERR && val2 === 6) {
            return Promise.resolve(true);
          } else if (val1 === Application.PLEX && val2 === 5) {
            return Promise.resolve(undefined);
          }

          throw new Error('Invalid test setup');
        },
      );

      mockedRuleConstanstService.getValueHumanName.mockReturnValue(
        'App - rule name',
      );
      mockedRuleConstanstService.getCustomValueIdentifier.mockReturnValue({
        type: 'custom value type',
        value: 'custom value',
      });

      const result = await ruleComparatorService.executeRulesWithData(
        ruleGroup,
        plexData,
      );

      expect(result.data).toEqual([]);
      expect(result.stats).toEqual([
        {
          plexId: 12345,
          result: false,
          sectionResults: [
            {
              id: 0,
              result: false,
              ruleResults: [
                {
                  action: 'equals',
                  firstValue: true,
                  firstValueName: 'App - rule name',
                  result: true,
                  secondValue: 1,
                  secondValueName: 'custom value type',
                },
                {
                  action: 'bigger',
                  firstValue: undefined,
                  firstValueName: 'App - rule name',
                  result: 'error',
                  secondValue: 0,
                  secondValueName: 'custom value type',
                  operator: 'AND',
                },
              ],
            },
          ],
        } satisfies IComparisonStatistics,
      ]);
    });
  });

  describe('doRuleAction', () => {
    const equalsData = [
      [true, 'abc', 'abc'],
      [true, 'abc', 'ABC'],
      [true, ['abc', 'def'], ['abc', 'def']],
      [true, ['abc', 'def'], ['ABC', 'DEF']],
      [true, ['abc'], 'abc'],
      [true, ['abc'], 'ABC'],
      [true, new Date('2022-01-01'), new Date('2022-01-01')],
      [true, 5, 5],
      [true, [], []],
      [false, 'abc', ''],
      [false, 'abc', undefined],
      [false, 'abc', 'abd'],
      [false, ['abc'], ['abc', 'def']],
      [false, ['abc', 'def'], ['abc']],
      [false, ['abc', 'def'], ['abc', 'cde']],
      [false, new Date('2022-01-01'), new Date('2022-01-02')],
      [false, 5, 4],
    ] as [boolean, any, any][];

    it.each(equalsData)(
      'should return %s when val1 is %o and val2 is %o with action EQUALS',
      (expected, val1, val2) => {
        const action = RulePossibility.EQUALS;
        const result = ruleComparatorService['doRuleAction'](
          val1,
          val2,
          action,
        );
        expect(result).toBe(expected);
      },
    );

    it.each(equalsData)(
      'should return %s when val1 is %o and val2 is %o with action NOT_EQUALS',
      (expected, val1, val2) => {
        const action = RulePossibility.NOT_EQUALS;
        const result = ruleComparatorService['doRuleAction'](
          val1,
          val2,
          action,
        );
        expect(result).toBe(!expected);
      },
    );

    const containsData = [
      [true, 'abc', 'ab'],
      [true, ['abc', 'def'], ['ral', undefined, 'abc']],
      [true, [1, 2, 3, 4], [3]],
      [true, [1, 2, 3, 4], [3, 1]],
      [true, ['abc', 'def'], ['abc']],
      [false, 'abc', 'de'],
      [false, ['abc', 'def'], ['ral', undefined, 'rel']],
      [false, ['abc', 'def'], ['ghi']],
      [false, [1, 2, 3, 4], [6]],
      [false, [1, 2, 3, 4], [6, 5]],
      [false, ['ImDb top 250', 'My birthday', 'jef'], ['imdb']],
      [false, ['abc', 'def'], ['']],
    ] as [boolean, any, any][];

    it.each(containsData)(
      'should return %s when val1 is %o and val2 is %o with action CONTAINS',
      (expected, val1, val2) => {
        const action = RulePossibility.CONTAINS;
        const result = ruleComparatorService['doRuleAction'](
          val1,
          val2,
          action,
        );
        expect(result).toBe(expected);
      },
    );

    it.each(containsData)(
      'should return %s when val1 is %o and val2 is %o with action NOT_CONTAINS',
      (expected, val1, val2) => {
        const action = RulePossibility.NOT_CONTAINS;
        const result = ruleComparatorService['doRuleAction'](
          val1,
          val2,
          action,
        );
        expect(result).toBe(!expected);
      },
    );

    const containsPartialData = [
      [true, 'abc', 'ab'],
      [true, ['abc', 'def'], ['abc']],
      [true, ['ImDb top 250', 'My birthday', 'jef'], ['imdb']],
      [true, ['abc', 'def'], ['ral', undefined, 'abc']],
      [true, ['abc', 'def'], ['ral', undefined, 'ab']],
      [false, 'abc', 'de'],
      [false, ['ImDb top 250', 'My birthday', 'jef'], ['jos']],
      [false, ['abc', 'def'], ['']],
      [false, ['abc', 'def'], ['ral', undefined, 'rel']],
      [false, [1, 2, 3, 4], [6]],
    ] as [boolean, any, any][];

    it.each(containsPartialData)(
      'should return %s when val1 is %o and val2 is %o with action CONTAINS_PARTIAL',
      (expected, val1, val2) => {
        const action = RulePossibility.CONTAINS_PARTIAL;
        const result = ruleComparatorService['doRuleAction'](
          val1,
          val2,
          action,
        );
        expect(result).toBe(expected);
      },
    );

    it.each(containsPartialData)(
      'should return %s when val1 is %o and val2 is %o with action NOT_CONTAINS_PARTIAL',
      (expected, val1, val2) => {
        const action = RulePossibility.NOT_CONTAINS_PARTIAL;
        const result = ruleComparatorService['doRuleAction'](
          val1,
          val2,
          action,
        );
        expect(result).toBe(!expected);
      },
    );

    const containsAllData = [
      [true, ['abc', 'def', 'ghi'], ['abc', 'def']],
      [true, ['abc', 'def', 'ghi'], ['abc']],
      [true, ['abc', 'def'], 'abc'],
      [true, ['ABC', 'def'], ['abc']],
      [true, ['abc', 'def'], ['ABC', 'DEF']],
      [true, [1, 2, 3, 4], [1, 3]],
      [true, [1, 2, 3, 4], [1]],
      [true, ['abc', 'def', 'ghi'], ['abc', 'def', 'ghi']],
      [false, ['abc', 'def'], ['abc', 'xyz']],
      [false, ['abc', 'def'], ['xyz', 'uvw']],
      [false, ['abc', 'def'], ['abc', 'def', 'ghi']],
      [false, ['abc', 'def'], ['']],
      [false, ['abc', 'def'], [undefined]],
      [false, ['abc', 'def'], []],
      [false, [1, 2, 3], [1, 5]],
      [false, [], ['abc']],
    ] as [boolean, any, any][];

    it.each(containsAllData)(
      'should return %s when val1 is %o and val2 is %o with action CONTAINS_ALL',
      (expected, val1, val2) => {
        const action = RulePossibility.CONTAINS_ALL;
        const result = ruleComparatorService['doRuleAction'](
          val1,
          val2,
          action,
        );
        expect(result).toBe(expected);
      },
    );

    it.each(containsAllData)(
      'should return %s when val1 is %o and val2 is %o with action NOT_CONTAINS_ALL',
      (expected, val1, val2) => {
        const action = RulePossibility.NOT_CONTAINS_ALL;
        const result = ruleComparatorService['doRuleAction'](
          val1,
          val2,
          action,
        );
        expect(result).toBe(!expected);
      },
    );

    it('should return true when comparing two numbers with action BIGGER', () => {
      const val1 = 5;
      const val2 = 3;
      const action = RulePossibility.BIGGER;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(true);
    });

    it('should return false when comparing two numbers with action SMALLER', () => {
      const val1 = 5;
      const val2 = 3;
      const action = RulePossibility.SMALLER;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return false when comparing two numbers with action SMALLER and value is undefined', () => {
      const val1 = 5;
      const val2 = undefined;
      const action = RulePossibility.SMALLER;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return true when comparing two dates with action BEFORE', () => {
      const val1 = new Date('2022-01-01');
      const val2 = new Date('2022-01-02');
      const action = RulePossibility.BEFORE;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(true);
    });

    it('should return false when comparing two dates with action BEFORE and value is undefined', () => {
      const val1 = new Date('2022-01-01');
      const val2 = undefined;
      const action = RulePossibility.BEFORE;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return false when comparing two dates with action BEFORE', () => {
      const val1 = new Date('2022-01-03');
      const val2 = new Date('2022-01-02');
      const action = RulePossibility.BEFORE;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return true when comparing two dates with action AFTER', () => {
      const val1 = new Date('2022-01-03');
      const val2 = new Date('2022-01-02');
      const action = RulePossibility.AFTER;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(true);
    });

    it('should return false when comparing two dates with action AFTER', () => {
      const val1 = new Date('2022-01-01');
      const val2 = new Date('2022-01-02');
      const action = RulePossibility.AFTER;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return false when comparing two dates with action AFTER and value is undefined', () => {
      const val1 = new Date('2022-01-01');
      const val2 = undefined;
      const action = RulePossibility.AFTER;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return true when comparing a date with action IN_LAST', () => {
      const val1 = new Date(Date.now() - 1000); // One second ago
      const val2 = new Date(new Date().getTime() - +3600 * 1000); // 1 hour in seconds
      const action = RulePossibility.IN_LAST;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(true);
    });

    it('should return false when comparing a date with action IN_LAST', () => {
      const val1 = new Date(Date.now() - 3600 * 2000); // More than 1 hour ago
      const val2 = new Date(new Date().getTime() - +3600 * 1000);
      const action = RulePossibility.IN_LAST;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return false when comparing a date with action IN_LAST and value is undefined', () => {
      const val1 = new Date(Date.now() - 3600 * 2000); // More than 1 hour ago
      const val2 = undefined;
      const action = RulePossibility.IN_LAST;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return true when comparing a date with action IN_NEXT', () => {
      const val1 = new Date(new Date().getTime() + +432000 * 1000); // 5 days from now
      const val2 = new Date(new Date().getTime() + +864000 * 1000); // 10 days from now
      const action = RulePossibility.IN_NEXT;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(true);
    });

    it('should return false when comparing a date with action IN_NEXT', () => {
      const val1 = new Date(new Date().getTime() + +865000 * 1000); // More than 10 days from now
      const val2 = new Date(new Date().getTime() + +864000 * 1000); // 10 days from now
      const action = RulePossibility.IN_NEXT;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    it('should return false when comparing a date with action IN_NEXT and value is undefined', () => {
      const val1 = new Date(new Date().getTime() + +865000 * 1000); // More than 10 days from now
      const val2 = undefined; // 10 days from now
      const action = RulePossibility.IN_NEXT;
      const result = ruleComparatorService['doRuleAction'](val1, val2, action);
      expect(result).toBe(false);
    });

    const listCountData = [
      // Equality
      // Text lists
      [true, ['a1', 'b2', 'c3'], 3, RulePossibility.COUNT_EQUALS],
      [false, ['a1', 'b2', 'c3'], 4, RulePossibility.COUNT_EQUALS],
      [false, ['a1', 'b2', 'c3'], 3, RulePossibility.COUNT_NOT_EQUALS],
      [true, ['a1', 'b2', 'c3'], 4, RulePossibility.COUNT_NOT_EQUALS],

      // > and <
      // Text lists
      [true, ['a1', 'b2', 'c3'], 2, RulePossibility.COUNT_BIGGER],
      [false, ['a1', 'b2', 'c3'], 3, RulePossibility.COUNT_BIGGER],
      [false, ['a1', 'b2', 'c3'], 4, RulePossibility.COUNT_BIGGER],
      [true, ['a1', 'b2', 'c3'], 4, RulePossibility.COUNT_SMALLER],
      [false, ['a1', 'b2', 'c3'], 3, RulePossibility.COUNT_SMALLER],
      [false, ['a1', 'b2', 'c3'], 2, RulePossibility.COUNT_SMALLER],
    ] as const;
    const actionName = {
      [RulePossibility.COUNT_EQUALS]: 'COUNT_EQUALS',
      [RulePossibility.COUNT_NOT_EQUALS]: 'COUNT_NOT_EQUALS',
      [RulePossibility.COUNT_BIGGER]: 'COUNT_BIGGER',
      [RulePossibility.COUNT_SMALLER]: 'COUNT_SMALLER',
    };
    listCountData.forEach(([expected, val1, val2, action]) => {
      it(`should return ${expected} when val1 is ${JSON.stringify(val1)} and val2 is ${val2} with action ${actionName[action]}`, () => {
        expect(
          ruleComparatorService['doRuleAction'](
            val1 as Writeable<typeof val1>,
            val2,
            action,
          ),
        ).toBe(expected);
      });
    });
  });
});

type Writeable<T> = { -readonly [P in keyof T]: T[P] };
