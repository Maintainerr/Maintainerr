import { MediaItem } from '@maintainerr/contracts';
import { TestBed } from '@suites/unit';
import { writeFileSync } from 'fs';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { EmbyGetterService } from './emby-getter.service';
import { JellyfinGetterService } from './jellyfin-getter.service';
import { PlexGetterService } from './plex-getter.service';
import { RadarrGetterService } from './radarr-getter.service';
import { SeerrGetterService } from './seerr-getter.service';
import { SonarrGetterService } from './sonarr-getter.service';
import { StreamystatsGetterService } from './streamystats-getter.service';
import { TautulliGetterService } from './tautulli-getter.service';

// Per-property getter coverage harness.
//
// Purpose: prove that EVERY rule property (all ~166 across all applications)
// has a getter path that resolves to a RuleValueType without throwing, and
// that the result is independent of the TypeORM version. Run on both 0.3.x and
// 1.0.x with the same code and diff the emitted JSON (GETTER_MATRIX_OUT) - it
// must be byte-identical, since getters derive values from (mocked) API
// responses in memory, not from the database.
//
// Deterministic by construction: dependencies are auto-mocked (return
// undefined) and the input media item is a fixed literal - no faker, no clock.

const libItem: MediaItem = {
  id: 'fixed-item-1',
  title: 'Fixed Item',
  guid: 'plex://movie/fixed',
  type: 'movie',
  addedAt: new Date('2020-01-01T00:00:00.000Z'),
  updatedAt: new Date('2020-06-01T00:00:00.000Z'),
  providerIds: { tvdb: ['1'], tmdb: ['2'], imdb: ['tt3'] },
  mediaSources: [],
  library: { id: 'lib-1', title: 'Movies' },
  index: 1,
  summary: 'fixed summary',
  year: 2020,
} as MediaItem;

// Minimal rule group stub so getters that read ruleGroup.* don't hit a bare
// TypeError before their own try/catch.
const ruleGroup = {
  id: 1,
  collection: { id: 1 },
  dataType: 1,
  useRules: true,
  rules: [],
} as any;

const buildGetter = async <T>(cls: new (...args: any[]) => T): Promise<T> => {
  const { unit } = await TestBed.solitary(cls as any).compile();
  return unit as T;
};

// Per-application: how to construct the getter and how to invoke .get() with
// the correct positional arguments for that getter's signature.
const apps: Array<{
  app: Application;
  build: () => Promise<{ get: (id: number) => Promise<unknown> }>;
}> = [
  {
    app: Application.PLEX,
    build: async () => {
      const g = await buildGetter(PlexGetterService);
      return { get: (id) => g.get(id, libItem, undefined, ruleGroup) };
    },
  },
  {
    app: Application.RADARR,
    build: async () => {
      const g = await buildGetter(RadarrGetterService);
      return { get: (id) => g.get(id, libItem, ruleGroup) };
    },
  },
  {
    app: Application.SONARR,
    build: async () => {
      const g = await buildGetter(SonarrGetterService);
      return { get: (id) => g.get(id, libItem, undefined, ruleGroup) };
    },
  },
  {
    app: Application.SEERR,
    build: async () => {
      const g = await buildGetter(SeerrGetterService);
      return { get: (id) => g.get(id, libItem, undefined) };
    },
  },
  {
    app: Application.TAUTULLI,
    build: async () => {
      const g = await buildGetter(TautulliGetterService);
      return { get: (id) => g.get(id, libItem, undefined, ruleGroup) };
    },
  },
  {
    app: Application.JELLYFIN,
    build: async () => {
      const g = await buildGetter(JellyfinGetterService);
      return { get: (id) => g.get(id, libItem, undefined, ruleGroup) };
    },
  },
  {
    app: Application.EMBY,
    build: async () => {
      const g = await buildGetter(EmbyGetterService);
      return { get: (id) => g.get(id, libItem, undefined, ruleGroup) };
    },
  },
  {
    app: Application.STREAMYSTATS,
    build: async () => {
      const g = await buildGetter(StreamystatsGetterService);
      return { get: (id) => g.get(id, libItem) };
    },
  },
];

// Deterministic, version-independent summary of a getter result (no raw values
// like random ids/dates - we record shape, which is what must stay stable).
const describeResult = (v: unknown): string => {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v instanceof Date) return 'date';
  return typeof v;
};

const propsFor = (app: Application): Property[] =>
  new RuleConstants().applications.find((a) => a.id === app)?.props ?? [];

describe('Getter property coverage matrix (all rule properties)', () => {
  const matrix: Record<string, string> = {};
  const threw: string[] = [];

  it('every rule property resolves to a RuleValueType without throwing', async () => {
    for (const { app, build } of apps) {
      const getter = await build();
      for (const prop of propsFor(app)) {
        const key = `${Application[app]}.${prop.id} ${prop.humanName}`;
        try {
          const result = await getter.get(prop.id);
          matrix[key] = describeResult(result);
        } catch (e) {
          matrix[key] = `THREW:${(e as Error).constructor.name}`;
          threw.push(`${key} -> ${(e as Error).message.split('\n')[0]}`);
        }
      }
    }

    // Emit the full matrix for cross-version diffing.
    const sorted = Object.fromEntries(
      Object.entries(matrix).sort(([a], [b]) => a.localeCompare(b)),
    );
    const out = process.env.GETTER_MATRIX_OUT ?? '/tmp/getter-matrix.json';
    writeFileSync(out, JSON.stringify(sorted, null, 2));

    // The invariant: no property throws out of its getter.
    expect(threw).toEqual([]);
  });

  it('covers every property defined in the rule constants', () => {
    const expected = apps.reduce(
      (sum, { app }) => sum + propsFor(app).length,
      0,
    );
    expect(Object.keys(matrix)).toHaveLength(expected);
  });
});
