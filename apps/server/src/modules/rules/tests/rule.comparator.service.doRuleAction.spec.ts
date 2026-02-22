import { TestBed } from '@suites/unit';
import { RulePossibility } from '../constants/rules.constants';
import { ValueGetterService } from '../getter/getter.service';
import { RuleComparatorService } from '../helpers/rule.comparator.service';

describe('RuleComparatorService', () => {
  let ruleComparatorService: RuleComparatorService;

  beforeEach(async () => {
    const { unit } = await TestBed.solitary(RuleComparatorService)
      .mock(ValueGetterService)
      .final({ get: jest.fn() })
      .compile();

    ruleComparatorService = unit;
  });

  describe('doRuleAction', () => {
    it('returns false for NOT_CONTAINS when searched tag exists in list (reported keep-tag scenario)', () => {
      const result = ruleComparatorService['doRuleAction'](
        ['9-simon', 'anime', 'huntarr-upgrade', 'keep'],
        'keep',
        RulePossibility.NOT_CONTAINS,
      );

      expect(result).toBe(false);
    });

    it('returns true for NOT_CONTAINS when searched tag does not exist in list', () => {
      const result = ruleComparatorService['doRuleAction'](
        ['9-simon', 'anime', 'huntarr-upgrade'],
        'keep',
        RulePossibility.NOT_CONTAINS,
      );

      expect(result).toBe(true);
    });

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
