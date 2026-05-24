import { type MediaItemType } from '@maintainerr/contracts';
import { createRulesDto } from '../../../../test/utils/data';
import { type RulesDto } from '../dtos/rules.dto';
import {
  countRuleCollectionNames,
  filterRuleCollectionNames,
  getParentBackedRuleItem,
  mapMatchingRuleUsersToNames,
  mapRuleUserIdsToNames,
  uniqueTrimmedRulePropertyNames,
} from './rule-property.helper';

interface TestUser {
  id: string;
  name: string;
}

const createRuleGroup = (): RulesDto =>
  createRulesDto({
    name: 'Cleanup Collection',
    collection: {
      manualCollectionName: 'Manual Cleanup',
    } as RulesDto['collection'],
  });

describe('rule-property.helper', () => {
  describe('collection helpers', () => {
    it('filters the rule collection and manual collection case-insensitively', () => {
      const collectionNames = [
        ' Franchise ',
        'cleanup collection',
        'Manual Cleanup',
        'Documentaries',
      ];

      expect(
        filterRuleCollectionNames(collectionNames, createRuleGroup()),
      ).toEqual(['Franchise', 'Documentaries']);
    });

    it('counts only collections that survive rule collection filtering', () => {
      expect(
        countRuleCollectionNames(
          ['Cleanup Collection', 'Manual Cleanup', 'Other Collection'],
          createRuleGroup(),
        ),
      ).toBe(1);
    });

    it('deduplicates property names after trimming and normalising case', () => {
      expect(
        uniqueTrimmedRulePropertyNames([' Franchise ', 'franchise', 'Saga']),
      ).toEqual(['Franchise', 'Saga']);
    });
  });

  describe('user mapping helpers', () => {
    const users: TestUser[] = [
      { id: 'u1', name: 'Alice' },
      { id: 'u2', name: 'Bob' },
    ];

    it('maps backend user ids to display names and keeps unknown ids visible', () => {
      expect(
        mapRuleUserIdsToNames(
          ['u2', 'missing'],
          users,
          (user) => user.id,
          (user) => user.name,
        ),
      ).toEqual(['Bob', 'missing']);
    });

    it('falls back to the backend user id when a mapped name is blank', () => {
      expect(
        mapRuleUserIdsToNames(
          ['u2', 'missing', 'u1'],
          [
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: '  ' },
          ],
          (user) => user.id,
          (user) => user.name,
        ),
      ).toEqual(['u2', 'missing', 'Alice']);
    });

    it('matches known users once in configured user order', () => {
      expect(
        mapMatchingRuleUsersToNames(
          ['u2', 'u2', 'u1'],
          users,
          (user) => user.id,
          (user) => user.name,
        ),
      ).toEqual(['Alice', 'Bob']);
    });
  });

  describe('parent-backed metadata helper', () => {
    it.each([
      ['episode', 'show'],
      ['season', 'season'],
      ['movie', 'movie'],
    ] as Array<[MediaItemType, string]>)(
      'selects %s rule metadata from the expected level',
      async (mediaType, expectedTitle) => {
        const item = { title: 'movie' };
        const parent = { title: 'season' };
        const grandparent = { title: 'show' };

        await expect(
          getParentBackedRuleItem(
            mediaType,
            item,
            async () => parent,
            async () => grandparent,
          ),
        ).resolves.toEqual({ title: expectedTitle });
      },
    );
  });
});
