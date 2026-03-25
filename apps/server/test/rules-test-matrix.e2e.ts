// Regression matrix for the rules test endpoint.
//
// Purpose:
// - exercise /api/rules/test end-to-end with a stable matrix of rule/value pairs
// - catch behavioral drift in comparator logic, rule wiring, and response shaping
// - complement targeted unit specs rather than duplicate every getter-specific case
//
// How to use:
// - run the script directly with ts-node from apps/server
// - capture the JSON output and compare it across refactors or against a release tag
// - treat this as a regression harness, not a replacement for dedicated unit tests
//
// Versioning note:
// - keep a single repo copy that matches the current codebase
// - for historical comparisons against older releases, use a temporary compatibility
//   copy outside the repo instead of checking in multiple version-pinned variants
import {
  Application,
  MediaItemType,
  RuleOperators,
  RulePossibility,
} from '@maintainerr/contracts';
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MediaServerFactory } from '../src/modules/api/media-server/media-server.factory';
import { CollectionsService } from '../src/modules/collections/collections.service';
import { CollectionMedia } from '../src/modules/collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../src/modules/logging/logs.service';
import { RuleConstanstService } from '../src/modules/rules/constants/constants.service';
import { RuleDto } from '../src/modules/rules/dtos/rule.dto';
import { RuleDbDto } from '../src/modules/rules/dtos/ruleDb.dto';
import { CommunityRuleKarma } from '../src/modules/rules/entities/community-rule-karma.entities';
import { Exclusion } from '../src/modules/rules/entities/exclusion.entities';
import { RuleGroup } from '../src/modules/rules/entities/rule-group.entities';
import { Rules } from '../src/modules/rules/entities/rules.entities';
import { ValueGetterService } from '../src/modules/rules/getter/getter.service';
import { RuleComparatorServiceFactory } from '../src/modules/rules/helpers/rule.comparator.service';
import { RuleYamlService } from '../src/modules/rules/helpers/yaml.service';
import { RulesController } from '../src/modules/rules/rules.controller';
import { RulesService } from '../src/modules/rules/rules.service';
import { RuleExecutorJobManagerService } from '../src/modules/rules/tasks/rule-executor-job-manager.service';
import { RuleExecutorSchedulerService } from '../src/modules/rules/tasks/rule-executor-scheduler.service';
import { RadarrSettings } from '../src/modules/settings/entities/radarr_settings.entities';
import { Settings } from '../src/modules/settings/entities/settings.entities';
import { SonarrSettings } from '../src/modules/settings/entities/sonarr_settings.entities';
import { RuleMigrationService } from '../src/modules/settings/rule-migration.service';
import { createMediaItem } from './utils/data';

type Scenario = {
  name: string;
  rules: RuleDbDto[];
  values: unknown[];
  dataType?: MediaItemType;
  mediaType?: MediaItemType;
};

type ScenarioState = {
  ruleGroup: RuleGroup & { useRules: boolean; dataType: MediaItemType };
  rules: RuleDbDto[];
  values: unknown[];
};

const logger = {
  setContext: () => undefined,
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

const state: ScenarioState = {
  ruleGroup: {
    id: 1,
    useRules: true,
    dataType: 'movie',
  } as RuleGroup & { useRules: boolean; dataType: MediaItemType },
  rules: [],
  values: [],
};

let mediaItem = createMediaItem({ id: 'media-1', type: 'movie' });

const mediaServer = {
  resetMetadataCache: () => undefined,
  getMetadata: async () => mediaItem,
};

const ruleGroupRepository = {
  findOne: async () => state.ruleGroup,
  count: async () => 1,
};

const queryBuilder = {
  where() {
    return this;
  },
  getMany: async () => state.rules,
};

const connection = {
  getRepository: () => ({
    createQueryBuilder: () => queryBuilder,
  }),
};

const mediaServerFactory = {
  getService: async () => mediaServer,
};

const valueGetter = {
  get: async () => (state.values.length > 0 ? state.values.shift() : null),
};

function createStoredRule(
  id: number,
  section: number,
  properties: Partial<RuleDto>,
): RuleDbDto {
  const rule: RuleDto = {
    operator: null,
    action: RulePossibility.BIGGER,
    firstVal: [Application.PLEX, 3],
    section,
    ...properties,
  };

  return {
    id,
    section,
    ruleGroupId: 1,
    isActive: true,
    ruleJson: JSON.stringify(rule),
  };
}

function normalizeValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeResponse(name: string, response: any) {
  const stats = Array.isArray(response?.result) ? response.result : [];

  return {
    name,
    code: response?.code ?? null,
    stats: stats.map((stat: any) => ({
      mediaServerId: stat.mediaServerId,
      result: stat.result,
      sections: stat.sectionResults.map((section: any) => ({
        id: section.id,
        result: section.result,
        operator: section.operator ?? null,
        ruleResults: section.ruleResults.map((rule: any) => ({
          result: rule.result,
          operator: rule.operator ?? null,
          action: rule.action,
          firstValueName: rule.firstValueName,
          firstValue: normalizeValue(rule.firstValue),
          secondValueName: rule.secondValueName,
          secondValue: normalizeValue(rule.secondValue),
        })),
      })),
    })),
  };
}

async function executeScenario(baseUrl: string, scenario: Scenario) {
  state.ruleGroup.dataType = scenario.dataType ?? 'movie';
  state.rules = scenario.rules;
  state.values = [...scenario.values];
  mediaItem = createMediaItem({
    id: 'media-1',
    type: scenario.mediaType ?? scenario.dataType ?? 'movie',
  });

  const response = await fetch(`${baseUrl}/api/rules/test`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mediaId: 'media-1',
      rulegroupId: 1,
    }),
  });

  return normalizeResponse(scenario.name, await response.json());
}

function buildScenarioMatrix(): Scenario[] {
  return [
    {
      name: 'number-custom-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
      ],
      values: [10],
    },
    {
      name: 'number-custom-fail',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
      ],
      values: [3],
    },
    {
      name: 'number-bigger-equality-boundary-fails',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
      ],
      values: [5],
    },
    {
      name: 'number-missing-first',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
      ],
      values: [null],
    },
    {
      name: 'number-lastval-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          lastVal: [Application.PLEX, 9],
        }),
      ],
      values: [10, 5],
    },
    {
      name: 'number-lastval-missing-second',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          lastVal: [Application.PLEX, 9],
        }),
      ],
      values: [10, null],
    },
    {
      name: 'number-lastval-missing-second-not-equals',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.NOT_EQUALS,
          firstVal: [Application.PLEX, 3],
          lastVal: [Application.PLEX, 9],
        }),
      ],
      values: [10, null],
    },
    {
      name: 'number-both-missing',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          lastVal: [Application.PLEX, 9],
        }),
      ],
      values: [null, null],
    },
    {
      name: 'date-before-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BEFORE,
          firstVal: [Application.PLEX, 0],
          customVal: { ruleTypeId: 1, value: '2025-01-01T00:00:00.000Z' },
        }),
      ],
      values: [new Date('2024-01-01T00:00:00.000Z')],
    },
    {
      name: 'date-before-equality-boundary-matches',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BEFORE,
          firstVal: [Application.PLEX, 0],
          customVal: { ruleTypeId: 1, value: '2025-01-01T00:00:00.000Z' },
        }),
      ],
      values: [new Date('2025-01-01T00:00:00.000Z')],
    },
    {
      name: 'date-before-missing-first',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BEFORE,
          firstVal: [Application.PLEX, 0],
          customVal: { ruleTypeId: 1, value: '2025-01-01T00:00:00.000Z' },
        }),
      ],
      values: [null],
    },
    {
      name: 'date-lastval-missing-second-in-last',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.IN_LAST,
          firstVal: [Application.PLEX, 0],
          lastVal: [Application.PLEX, 2],
        }),
      ],
      values: [new Date('2024-01-01T00:00:00.000Z'), null],
    },
    {
      name: 'text-contains-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.CONTAINS,
          firstVal: [Application.PLEX, 8],
          customVal: { ruleTypeId: 2, value: '1080' },
        }),
      ],
      values: ['HEVC 1080p'],
    },
    {
      name: 'text-lastval-missing-second-not-equals',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.NOT_EQUALS,
          firstVal: [Application.PLEX, 8],
          lastVal: [Application.PLEX, 10],
        }),
      ],
      values: ['HEVC 1080p', null],
    },
    {
      name: 'text-number-coercion-does-not-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.EQUALS,
          firstVal: [Application.PLEX, 8],
          lastVal: [Application.PLEX, 3],
        }),
      ],
      values: ['5', 5],
    },
    {
      name: 'text-lastval-missing-second-not-contains',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.NOT_CONTAINS,
          firstVal: [Application.PLEX, 8],
          lastVal: [Application.PLEX, 10],
        }),
      ],
      values: ['HEVC 1080p', null],
    },
    {
      name: 'bool-equals-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.EQUALS,
          firstVal: [Application.PLEX, 30],
          customVal: { ruleTypeId: 3, value: '1' },
        }),
      ],
      values: [true],
    },
    {
      name: 'bool-number-coercion-matches',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.EQUALS,
          firstVal: [Application.PLEX, 30],
          lastVal: [Application.PLEX, 3],
        }),
      ],
      values: [true, 1],
    },
    {
      name: 'bool-lastval-missing-second-not-equals',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.NOT_EQUALS,
          firstVal: [Application.PLEX, 30],
          lastVal: [Application.PLEX, 30],
        }),
      ],
      values: [true, null],
    },
    {
      name: 'tautulli-view-count-greater-than-custom',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.TAUTULLI, 3],
          customVal: { ruleTypeId: 0, value: '2' },
        }),
      ],
      values: [3],
    },
    {
      name: 'cross-app-or-section-matches-on-second-rule',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.TAUTULLI, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
        createStoredRule(2, 0, {
          operator: RuleOperators.OR,
          action: RulePossibility.EQUALS,
          firstVal: [Application.RADARR, 20],
          customVal: { ruleTypeId: 3, value: '1' },
        }),
      ],
      values: [3, true],
    },
    {
      name: 'cross-app-and-section-requires-both-sections',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.TAUTULLI, 3],
          customVal: { ruleTypeId: 0, value: '2' },
        }),
        createStoredRule(2, 1, {
          operator: RuleOperators.AND,
          action: RulePossibility.CONTAINS,
          firstVal: [Application.SEERR, 0],
          customVal: { ruleTypeId: 2, value: 'JellyfinUser' },
        }),
      ],
      values: [3, ['PlexUser', 'JellyfinUser', 'LocalUser']],
    },
    {
      name: 'same-section-or-recovers-after-exact-array-miss',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.CONTAINS,
          firstVal: [Application.SEERR, 0],
          customVal: { ruleTypeId: 2, value: 'imdb' },
        }),
        createStoredRule(2, 0, {
          operator: RuleOperators.OR,
          action: RulePossibility.CONTAINS_PARTIAL,
          firstVal: [Application.SEERR, 0],
          customVal: { ruleTypeId: 2, value: 'imdb' },
        }),
      ],
      values: [
        ['ImDb top 250', 'My birthday', 'jef'],
        ['ImDb top 250', 'My birthday', 'jef'],
      ],
    },
    {
      name: 'negated-array-rules-fail-before-later-or-recovery',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.NOT_CONTAINS,
          firstVal: [Application.SEERR, 0],
          customVal: { ruleTypeId: 2, value: 'keep' },
        }),
        createStoredRule(2, 0, {
          operator: RuleOperators.OR,
          action: RulePossibility.NOT_CONTAINS_ALL,
          firstVal: [Application.SEERR, 0],
          customVal: { ruleTypeId: 4, value: '["keep","anime"]' },
        }),
        createStoredRule(3, 1, {
          operator: RuleOperators.OR,
          action: RulePossibility.EQUALS,
          firstVal: [Application.RADARR, 20],
          customVal: { ruleTypeId: 3, value: '1' },
        }),
      ],
      values: [
        ['9-simon', 'anime', 'huntarr-upgrade', 'keep'],
        ['9-simon', 'anime', 'huntarr-upgrade', 'keep'],
        true,
      ],
    },
    {
      name: 'same-section-or-fallback-after-missing',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
        createStoredRule(2, 0, {
          operator: RuleOperators.OR,
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
      ],
      values: [null, 10],
    },
    {
      name: 'same-section-and-missing-removes-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
        createStoredRule(2, 0, {
          operator: RuleOperators.AND,
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
      ],
      values: [10, null],
    },
    {
      name: 'later-or-section-preserves-earlier-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
        createStoredRule(2, 1, {
          operator: RuleOperators.OR,
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
      ],
      values: [10, null],
    },
    {
      name: 'later-and-section-removes-earlier-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
        createStoredRule(2, 1, {
          operator: RuleOperators.AND,
          action: RulePossibility.BIGGER,
          firstVal: [Application.PLEX, 3],
          customVal: { ruleTypeId: 0, value: '5' },
        }),
      ],
      values: [10, null],
    },
    {
      name: 'three-section-and-or-chain-keeps-earlier-match',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.TAUTULLI, 3],
          customVal: { ruleTypeId: 0, value: '2' },
        }),
        createStoredRule(2, 1, {
          operator: RuleOperators.AND,
          action: RulePossibility.CONTAINS_PARTIAL,
          firstVal: [Application.SEERR, 0],
          customVal: { ruleTypeId: 2, value: 'Jelly' },
        }),
        createStoredRule(3, 2, {
          operator: RuleOperators.OR,
          action: RulePossibility.EQUALS,
          firstVal: [Application.RADARR, 20],
          customVal: { ruleTypeId: 3, value: '1' },
        }),
      ],
      values: [3, ['PlexUser', 'JellyfinUser'], false],
    },
    {
      name: 'three-section-and-or-chain-recovers-after-and-failure',
      rules: [
        createStoredRule(1, 0, {
          action: RulePossibility.BIGGER,
          firstVal: [Application.TAUTULLI, 3],
          customVal: { ruleTypeId: 0, value: '2' },
        }),
        createStoredRule(2, 1, {
          operator: RuleOperators.AND,
          action: RulePossibility.CONTAINS_PARTIAL,
          firstVal: [Application.SEERR, 0],
          customVal: { ruleTypeId: 2, value: 'Jelly' },
        }),
        createStoredRule(3, 2, {
          operator: RuleOperators.OR,
          action: RulePossibility.EQUALS,
          firstVal: [Application.RADARR, 20],
          customVal: { ruleTypeId: 3, value: '1' },
        }),
      ],
      values: [3, ['PlexUser', 'LocalUser'], true],
    },
  ];
}

async function bootstrapApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [RulesController],
    providers: [
      RulesService,
      RuleComparatorServiceFactory,
      RuleConstanstService,
      {
        provide: ValueGetterService,
        useValue: valueGetter,
      },
      {
        provide: RuleExecutorSchedulerService,
        useValue: {},
      },
      {
        provide: RuleExecutorJobManagerService,
        useValue: {
          isProcessing: () => false,
        },
      },
      {
        provide: MediaServerFactory,
        useValue: mediaServerFactory,
      },
      {
        provide: CollectionsService,
        useValue: {},
      },
      {
        provide: DataSource,
        useValue: connection,
      },
      {
        provide: RuleYamlService,
        useValue: {},
      },
      {
        provide: RuleMigrationService,
        useValue: {},
      },
      {
        provide: EventEmitter2,
        useValue: { emit: () => undefined },
      },
      {
        provide: getRepositoryToken(Rules),
        useValue: {},
      },
      {
        provide: getRepositoryToken(RuleGroup),
        useValue: ruleGroupRepository,
      },
      {
        provide: getRepositoryToken(CommunityRuleKarma),
        useValue: {},
      },
      {
        provide: getRepositoryToken(Exclusion),
        useValue: {},
      },
      {
        provide: getRepositoryToken(Settings),
        useValue: { findOne: async () => undefined },
      },
      {
        provide: getRepositoryToken(RadarrSettings),
        useValue: { exists: async () => false },
      },
      {
        provide: getRepositoryToken(SonarrSettings),
        useValue: { exists: async () => false },
      },
      {
        provide: 'CollectionMediaRepository',
        useValue: {},
      },
      {
        provide: getRepositoryToken(CollectionMedia),
        useValue: {},
      },
      {
        provide: MaintainerrLogger,
        useValue: logger,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);

  return app;
}

async function main() {
  const app = await bootstrapApp();
  const baseUrl = await app.getUrl();

  try {
    const results = [];

    for (const scenario of buildScenarioMatrix()) {
      results.push(await executeScenario(baseUrl, scenario));
    }

    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
