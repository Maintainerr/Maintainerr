import {
  MediaServerType,
  MetadataProviderPreference,
  TELEMETRY_MAX_RULE_PROPERTIES,
  TELEMETRY_MAX_RULE_PROPERTY_LENGTH,
  TelemetryPing,
} from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { Repository } from 'typeorm';
import { ExternalApiService } from '../api/external-api/external-api.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { Notification } from '../notifications/entities/notification.entities';
import { RuleConstanstService } from '../rules/constants/constants.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Rules } from '../rules/entities/rules.entities';
import { SettingsDataService } from '../settings/settings-data.service';
import { VersionService } from '../version/version.service';
import { TelemetryService } from './telemetry.service';

/** Collector allowlist: word characters, dots, dashes, plus. */
const COLLECTOR_TOKEN = /^[\w.\-+]+$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const ruleJson = (firstVal: unknown, lastVal?: unknown) =>
  ({
    ruleJson: JSON.stringify({
      operator: null,
      action: 18,
      firstVal,
      ...(lastVal !== undefined ? { lastVal } : {}),
      section: 0,
    }),
  }) as Rules;

describe('TelemetryService', () => {
  let service: TelemetryService;
  let rulesRepo: Mocked<Repository<Rules>>;
  let ruleGroupRepo: Mocked<Repository<RuleGroup>>;
  let collectionRepo: Mocked<Repository<Collection>>;
  let collectionMediaRepo: Mocked<Repository<CollectionMedia>>;
  let exclusionRepo: Mocked<Repository<Exclusion>>;
  let notificationRepo: Mocked<Repository<Notification>>;
  let settings: Mocked<SettingsDataService>;
  let versionService: Mocked<VersionService>;

  const envBackup = { ...process.env };

  beforeEach(async () => {
    process.env = { ...envBackup };
    delete process.env.TELEMETRY;
    delete process.env.TELEMETRY_URL;

    const { unit, unitRef } =
      await TestBed.solitary(TelemetryService).compile();
    service = unit;

    rulesRepo = unitRef.get('RulesRepository');
    ruleGroupRepo = unitRef.get('RuleGroupRepository');
    collectionRepo = unitRef.get('CollectionRepository');
    collectionMediaRepo = unitRef.get('CollectionMediaRepository');
    exclusionRepo = unitRef.get('ExclusionRepository');
    notificationRepo = unitRef.get('NotificationRepository');
    settings = unitRef.get(SettingsDataService);
    versionService = unitRef.get(VersionService);
    unitRef.get(MaintainerrLogger);

    // TypeORM's find always resolves an array; without a default the auto-mock
    // reads undefined and fails in a way production cannot.
    rulesRepo.find.mockResolvedValue([]);
    ruleGroupRepo.find.mockResolvedValue([]);
    collectionRepo.find.mockResolvedValue([]);
    notificationRepo.find.mockResolvedValue([]);
    ruleGroupRepo.count.mockResolvedValue(0);
    collectionRepo.count.mockResolvedValue(0);
    collectionMediaRepo.count.mockResolvedValue(0);
    exclusionRepo.count.mockResolvedValue(0);
    notificationRepo.count.mockResolvedValue(0);

    // The property lookup is the behaviour under test, so the constants service
    // delegates to a real instance rather than a stub.
    const realConstants = new RuleConstanstService();
    unitRef
      .get(RuleConstanstService)
      .getValueIdentifier.mockImplementation((location) =>
        realConstants.getValueIdentifier(location),
      );

    versionService.getCurrentVersion.mockReturnValue('3.24.0');
    versionService.getVersionTag.mockReturnValue('latest');

    settings.telemetryEnabled = true;
    settings.media_server_type = MediaServerType.PLEX;
    settings.metadata_provider_preference =
      MetadataProviderPreference.TMDB_PRIMARY;
    settings.getRadarrSettingsCount.mockResolvedValue(0);
    settings.getSonarrSettingsCount.mockResolvedValue(0);
    settings.getSportarrSettingsCount.mockResolvedValue(0);
    settings.seerrConfigured.mockReturnValue(false);
    settings.tautulliConfigured.mockReturnValue(false);
    settings.downloadClientConfigured.mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = envBackup;
  });

  describe('census', () => {
    it('omits the sample key entirely when not sampling', async () => {
      const ping = await service.buildPayload(false);

      expect('sample' in ping).toBe(false);
      expect(ping).toEqual({
        version: '3.24.0',
        versionTag: 'latest',
        isDocker: expect.any(Boolean),
        nodeMajor: expect.any(Number),
        arch: expect.any(String),
        platform: expect.any(String),
        mediaServer: 'plex',
      });
    });

    it('reports none when no media server is configured', async () => {
      settings.media_server_type = undefined;

      expect((await service.buildPayload(false)).mediaServer).toBe('none');
    });

    it('never carries an identifier, in either variant', async () => {
      settings.clientId = '6f2a1c40-9d3e-4a17-8b52-0c7e1d9a4f38';

      for (const includeSample of [false, true]) {
        const serialized = JSON.stringify(
          await service.buildPayload(includeSample),
        );

        expect(serialized).not.toContain('clientId');
        expect(serialized).not.toContain('instanceId');
        expect(serialized).not.toContain(settings.clientId);
        expect(UUID.test(serialized)).toBe(false);
      }
    });

    /**
     * A build sha is near-unique, so reporting it would fingerprint the sender
     * in a census that carries no other identifier.
     */
    it('reports a release build by its version', async () => {
      versionService.getVersionTag.mockReturnValue('latest');
      versionService.getCurrentVersion.mockReturnValue('3.24.0');

      expect(await service.buildPayload(false)).toMatchObject({
        version: '3.24.0',
        versionTag: 'latest',
      });
    });

    it('reports a branch build by its stream, without the sha', async () => {
      versionService.getVersionTag.mockReturnValue('development');
      versionService.getCurrentVersion.mockReturnValue('development-bd8a1e0');

      expect(await service.buildPayload(false)).toMatchObject({
        version: 'development',
        versionTag: 'development',
      });
    });
  });

  describe('usage buckets', () => {
    it('bucketises every usage counter and sends no raw count', async () => {
      ruleGroupRepo.count.mockImplementation(async (options?: any) =>
        options?.where?.isActive ? 5 : 10,
      );
      collectionRepo.count.mockImplementation(async (options?: any) => {
        if (options?.where?.manualCollection) return 1;
        if (options?.where?.overlayEnabled) return 0;
        return 2;
      });
      exclusionRepo.count.mockResolvedValue(25);
      notificationRepo.count.mockResolvedValue(0);
      // Item counts run to thousands, so this one uses the wider sizeBucket.
      collectionMediaRepo.count.mockResolvedValue(7400);

      const { sample } = await service.buildPayload(true);

      expect(sample.usage).toEqual({
        ruleGroups: '10-24',
        activeRuleGroups: '5-9',
        collections: '2-4',
        manualCollections: '1',
        exclusions: '25+',
        notifications: '0',
        collectionItems: '5k-15k',
      });
    });
  });

  describe('rule properties', () => {
    it('resolves the apps and properties rules target', async () => {
      rulesRepo.find.mockResolvedValue([
        ruleJson([0, 1]), // plex.seenBy
        ruleJson([1, 5]), // radarr.monitored
      ]);

      const { sample } = await service.buildPayload(true);

      expect(sample.rulesApps).toEqual(['plex', 'radarr']);
      expect(sample.ruleProperties).toEqual([
        'plex.seenBy',
        'radarr.monitored',
      ]);
    });

    it('reads lastVal as well as firstVal', async () => {
      rulesRepo.find.mockResolvedValue([ruleJson([0, 0], [1, 4])]);

      expect((await service.buildPayload(true)).sample.ruleProperties).toEqual([
        'plex.addDate',
        'radarr.releaseDate',
      ]);
    });

    it('coerces references stored as strings', async () => {
      rulesRepo.find.mockResolvedValue([ruleJson(['0', '1'])]);

      expect((await service.buildPayload(true)).sample.ruleProperties).toEqual([
        'plex.seenBy',
      ]);
    });

    it('de-duplicates and caps at the collector limit', async () => {
      const rows: Rules[] = [];
      for (let propertyId = 0; propertyId < 40; propertyId++) {
        rows.push(ruleJson([0, propertyId]));
        rows.push(ruleJson([0, propertyId])); // duplicate
      }
      rulesRepo.find.mockResolvedValue(rows);

      const { ruleProperties } = (await service.buildPayload(true)).sample;

      expect(ruleProperties).toHaveLength(TELEMETRY_MAX_RULE_PROPERTIES);
      expect(new Set(ruleProperties).size).toBe(ruleProperties.length);
      expect([...ruleProperties].sort()).toEqual(ruleProperties);
    });

    it('skips references the constants no longer know', async () => {
      rulesRepo.find.mockResolvedValue([
        ruleJson([99, 99]),
        ruleJson([0, 9999]),
        ruleJson([0, 1]),
      ]);

      expect((await service.buildPayload(true)).sample.ruleProperties).toEqual([
        'plex.seenBy',
      ]);
    });

    it('does not throw on malformed ruleJson, and keeps the good rows', async () => {
      rulesRepo.find.mockResolvedValue([
        { ruleJson: 'not json at all' } as Rules,
        { ruleJson: '' } as Rules,
        { ruleJson: '{"firstVal":"nonsense"}' } as Rules,
        { ruleJson: '{"firstVal":[0]}' } as Rules,
        { ruleJson: '{"firstVal":["x","y"]}' } as Rules,
        ruleJson([0, 1]),
      ]);

      expect((await service.buildPayload(true)).sample.ruleProperties).toEqual([
        'plex.seenBy',
      ]);
    });

    it('sends no part of a rule beyond its property references', async () => {
      rulesRepo.find.mockResolvedValue([
        {
          ruleJson: JSON.stringify({
            operator: 1,
            action: 5,
            firstVal: [0, 1],
            customVal: { ruleTypeId: 2, value: 'a-secret-username' },
            username: 'someone',
            section: 0,
          }),
        } as Rules,
      ]);

      const serialized = JSON.stringify(await service.buildPayload(true));

      expect(serialized).not.toContain('a-secret-username');
      expect(serialized).not.toContain('someone');
      expect(serialized).not.toContain('customVal');
    });
  });

  describe('sample extraction', () => {
    it('reports the media types rule groups use, ignoring null and junk', async () => {
      ruleGroupRepo.find.mockResolvedValue([
        { dataType: 'show' },
        { dataType: 'movie' },
        { dataType: 'movie' },
        { dataType: null },
        { dataType: '1' },
      ] as RuleGroup[]);

      expect((await service.buildPayload(true)).sample.mediaTypes).toEqual([
        'movie',
        'show',
      ]);
    });

    it('maps collection arr actions to their enum names', async () => {
      collectionRepo.find.mockResolvedValue([
        { arrAction: 0 },
        { arrAction: 3 },
        { arrAction: 3 },
        { arrAction: 99 },
      ] as Collection[]);

      expect((await service.buildPayload(true)).sample.arrActions).toEqual([
        'DELETE',
        'UNMONITOR',
      ]);
    });

    it('reports configured notification agents, ignoring unknown ones', async () => {
      notificationRepo.find.mockResolvedValue([
        { agent: 'discord' },
        { agent: 'telegram' },
        { agent: 'discord' },
        { agent: 'not-an-agent' },
      ] as Notification[]);

      expect(
        (await service.buildPayload(true)).sample.notificationAgents,
      ).toEqual(['discord', 'telegram']);
    });

    it('reports configured integrations', async () => {
      settings.getRadarrSettingsCount.mockResolvedValue(2);
      settings.getSportarrSettingsCount.mockResolvedValue(1);
      settings.seerrConfigured.mockReturnValue(true);
      settings.downloadClientConfigured.mockReturnValue(true);
      settings.streamystats_url = null;
      settings.tracearr_url = 'http://tracearr.local';

      expect((await service.buildPayload(true)).sample.integrations).toEqual([
        'downloadClient',
        'radarr',
        'seerr',
        'sportarr',
        'tracearr',
      ]);
    });

    it('reports features in use', async () => {
      collectionRepo.count.mockImplementation(async (options?: any) =>
        options?.where?.overlayEnabled ? 4 : 0,
      );
      settings.radarr_tag_exclusions = true;
      settings.sonarr_tag_exclusions = false;
      settings.metadata_provider_preference =
        MetadataProviderPreference.TVDB_PRIMARY;

      expect((await service.buildPayload(true)).sample.features).toEqual([
        'arrTagExclusionsRadarr',
        'metadata_tvdb_primary',
        'overlays',
      ]);
    });

    /**
     * The collector accepts any token in `features`, so a new one ships and is
     * stored with nothing failing, while the collector README goes on listing
     * the old set. That README is a published privacy disclosure, so the drift
     * is only ever in the wrong direction: it understates what is collected.
     *
     * Pinned here rather than there because this is the side that decides.
     * If this fails, the token list changed - update the `features` sentence
     * in the collector README in the same release.
     */
    it('emits only the feature tokens the collector README discloses', async () => {
      collectionRepo.count.mockResolvedValue(1); // every per-collection opt-in on
      settings.radarr_tag_exclusions = true;
      settings.sonarr_tag_exclusions = true;
      settings.metadata_provider_preference =
        MetadataProviderPreference.TMDB_PRIMARY;

      const { sample } = await service.buildPayload(true);

      expect(sample.features).toEqual([
        'arrTagExclusionsRadarr',
        'arrTagExclusionsSonarr',
        'keepInMaintainerrOnly',
        'leftoverCleanup',
        'metadata_tmdb_primary',
        'overlays',
      ]);
    });

    it('sends whether an integration is configured, never its URL or key', async () => {
      settings.seerrConfigured.mockReturnValue(true);
      settings.tautulliConfigured.mockReturnValue(true);
      settings.seerr_url = 'http://seerr.example.internal:5055';
      settings.seerr_api_key = 'seerr-secret-key';
      settings.tautulli_api_key = 'tautulli-secret-key';
      settings.plex_auth_token = 'plex-auth-token';
      settings.apikey = 'maintainerr-api-key';

      const serialized = JSON.stringify(await service.buildPayload(true));

      for (const secret of [
        'example.internal',
        'seerr-secret-key',
        'tautulli-secret-key',
        'plex-auth-token',
        'maintainerr-api-key',
        '5055',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });
  });

  describe('collector contract', () => {
    const everyValue = (ping: TelemetryPing): string[] => [
      ping.version,
      ping.versionTag,
      ping.arch,
      ping.platform,
      ping.mediaServer,
      ...(ping.sample
        ? [
            ...Object.values(ping.sample.usage),
            ...ping.sample.rulesApps,
            ...ping.sample.ruleProperties,
            ...ping.sample.mediaTypes,
            ...ping.sample.arrActions,
            ...ping.sample.notificationAgents,
            ...ping.sample.integrations,
            ...ping.sample.features,
          ]
        : []),
    ];

    it('emits only values the collector will store', async () => {
      rulesRepo.find.mockResolvedValue([ruleJson([0, 1]), ruleJson([1, 5])]);
      ruleGroupRepo.find.mockResolvedValue([
        { dataType: 'movie' },
      ] as RuleGroup[]);
      collectionRepo.find.mockResolvedValue([{ arrAction: 2 }] as Collection[]);
      notificationRepo.find.mockResolvedValue([
        { agent: 'pushbullet' },
      ] as Notification[]);

      for (const value of everyValue(await service.buildPayload(true))) {
        expect(value).toMatch(COLLECTOR_TOKEN);
      }
    });

    /**
     * The collector discards an over-long value with no error. Exactly one
     * identifier overflows today and is truncated to fit; pinning the list
     * means a property added later that overflows fails here instead of
     * quietly going unmeasured.
     */
    it('overflows the collector cap for only the known property', () => {
      const applications = new RuleConstanstService().getRuleConstants()
        .applications;
      const identifiers = applications.flatMap((application) =>
        application.props.map(
          (property) => `${application.name.toLowerCase()}.${property.name}`,
        ),
      );

      expect(identifiers.length).toBeGreaterThan(0);
      for (const identifier of identifiers) {
        expect(identifier).toMatch(COLLECTOR_TOKEN);
      }
      expect(
        applications.every((application) => application.name.length <= 16),
      ).toBe(true);

      expect(
        identifiers.filter(
          (identifier) =>
            identifier.length > TELEMETRY_MAX_RULE_PROPERTY_LENGTH,
        ),
      ).toEqual(['plex.sw_collection_names_including_parent_and_smart']);

      // Truncation must not make two properties indistinguishable.
      const truncated = identifiers.map((identifier) =>
        identifier.slice(0, TELEMETRY_MAX_RULE_PROPERTY_LENGTH),
      );
      expect(new Set(truncated).size).toBe(new Set(identifiers).size);
    });

    /** The collector answers 413 above 4096 characters and the ping is lost. */
    it('stays inside the collector body limit at full stretch', async () => {
      const rows: Rules[] = [];
      for (let propertyId = 0; propertyId < 48; propertyId++) {
        rows.push(ruleJson([0, propertyId], [6, propertyId]));
      }
      rulesRepo.find.mockResolvedValue(rows);
      ruleGroupRepo.find.mockResolvedValue([
        { dataType: 'movie' },
        { dataType: 'show' },
        { dataType: 'season' },
        { dataType: 'episode' },
      ] as RuleGroup[]);
      collectionRepo.find.mockResolvedValue(
        [0, 1, 2, 3, 4, 5, 6, 7].map((arrAction) => ({
          arrAction,
        })) as Collection[],
      );
      notificationRepo.find.mockResolvedValue(
        [
          'discord',
          'email',
          'gotify',
          'ntfy',
          'pushbullet',
          'pushover',
          'slack',
          'telegram',
          'webhook',
          'lunasea',
        ].map((agent) => ({ agent })) as Notification[],
      );
      settings.getRadarrSettingsCount.mockResolvedValue(1);
      settings.getSonarrSettingsCount.mockResolvedValue(1);
      settings.getSportarrSettingsCount.mockResolvedValue(1);
      settings.seerrConfigured.mockReturnValue(true);
      settings.tautulliConfigured.mockReturnValue(true);
      settings.downloadClientConfigured.mockReturnValue(true);
      settings.streamystats_url = 'http://streamystats.local';
      settings.tracearr_url = 'http://tracearr.local';
      settings.radarr_tag_exclusions = true;
      settings.sonarr_tag_exclusions = true;
      collectionRepo.count.mockImplementation(async (options?: any) =>
        options?.where?.overlayEnabled ? 1 : 30,
      );

      const serialized = JSON.stringify(await service.buildPayload(true));

      expect(serialized.length).toBeLessThan(4096);
    });
  });

  describe('enabled', () => {
    it.each([
      ['on when the setting is on', true, true],
      ['off when the setting is off', false, false],
      // Unanswered reports; only an explicit refusal stops it.
      ['on when the install has not answered', null, true],
    ])('is %s', (_label, stored, expected) => {
      settings.telemetryEnabled = stored;

      expect(service.enabled()).toBe(expected);
    });

    it('is off when TELEMETRY=off, whatever the setting says', () => {
      settings.telemetryEnabled = true;
      process.env.TELEMETRY = 'off';

      expect(service.enabled()).toBe(false);
    });
  });

  describe('send', () => {
    let post: jest.SpyInstance;

    beforeEach(() => {
      post = jest
        .spyOn(ExternalApiService.prototype, 'post')
        .mockResolvedValue(undefined);
    });

    it('makes no HTTP call when disabled', async () => {
      settings.telemetryEnabled = false;

      await service.send(true);

      expect(post).not.toHaveBeenCalled();
    });

    it('posts the census to the ingest endpoint', async () => {
      await service.send(false);

      expect(post).toHaveBeenCalledTimes(1);
      const [endpoint, payload] = post.mock.calls[0];
      expect(endpoint).toBe('/v1/ingest');
      expect('sample' in (payload as TelemetryPing)).toBe(false);
    });

    it('includes the sample when asked to', async () => {
      await service.send(true);

      expect('sample' in (post.mock.calls[0][1] as TelemetryPing)).toBe(true);
    });

    /**
     * Census accuracy depends on at-most-once delivery: ExternalApiService
     * installs axios-retry globally, and a retry after a lost response would
     * count the same server twice with no identifier to de-duplicate on.
     */
    it('disables retries on the telemetry post', async () => {
      await service.send(false);

      expect(post.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          'axios-retry': { retries: 0 },
          timeout: 5000,
        }),
      );
    });

    it('swallows a failing post', async () => {
      post.mockRejectedValue(new Error('collector unreachable'));

      await expect(service.send(false)).resolves.toBeUndefined();
    });

    it('swallows a failing payload build', async () => {
      rulesRepo.find.mockRejectedValue(new Error('database is locked'));

      await expect(service.send(true)).resolves.toBeUndefined();
      expect(post).not.toHaveBeenCalled();
    });
  });
});
