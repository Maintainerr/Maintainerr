import {
  Application,
  MediaServerType,
  MediaType,
} from '@maintainerr/contracts';
import { RuleConstanstService } from './constants.service';
import { RuleConstants, RuleType } from './rules.constants';

const nullReasonCases: Array<[[number, number], string]> = [
  [[Application.PLEX, 1], 'Plex Last viewed is not recorded for this item'],
  [[Application.PLEX, 2], 'Plex Times viewed is not available for this item'],
  [
    [Application.PLEX, 3],
    'Plex Availability status is not available for this item',
  ],
  [[Application.PLEX, 4], 'Plex Label is not set for this item'],
  [
    [Application.PLEX, 5],
    'Plex Collection titles has no entries for this item',
  ],
];

describe('RuleConstanstService', () => {
  let service: RuleConstanstService;

  beforeEach(() => {
    service = new RuleConstanstService();
    service.ruleConstants = {
      applications: [
        {
          id: Application.PLEX,
          name: 'Plex',
          mediaType: MediaType.BOTH,
          props: [
            {
              id: 1,
              name: 'lastViewedAt',
              humanName: '[time] Last viewed',
              mediaType: MediaType.BOTH,
              type: RuleType.DATE,
            },
            {
              id: 2,
              name: 'viewCount',
              humanName: 'Times viewed',
              mediaType: MediaType.BOTH,
              type: RuleType.NUMBER,
            },
            {
              id: 3,
              name: 'isAvailable',
              humanName: 'Availability status',
              mediaType: MediaType.BOTH,
              type: RuleType.BOOL,
            },
            {
              id: 4,
              name: 'label',
              humanName: 'Label',
              mediaType: MediaType.BOTH,
              type: RuleType.TEXT,
            },
            {
              id: 5,
              name: 'collections',
              humanName: '[list] Collection titles',
              mediaType: MediaType.BOTH,
              type: RuleType.TEXT_LIST,
            },
          ],
        },
      ],
    } as RuleConstants;
  });

  it.each(nullReasonCases)(
    'returns %s for property %j',
    (location, expected) => {
      expect(service.getValueNullReason(location)).toBe(expected);
    },
  );

  it('falls back to a generic reason when the property is unknown', () => {
    expect(service.getValueNullReason([Application.PLEX, 999])).toBe(
      'Value unavailable',
    );
  });

  describe('naming a value after the server it was read from', () => {
    // The getter routes every media-server app to the configured server and
    // looks the property id up there, so a rule left unmigrated after a server
    // switch reads a different property than the one it stores. Property ids
    // do not line up across servers, so the label has to follow the value.
    beforeEach(() => {
      service.ruleConstants = {
        applications: [
          {
            id: Application.PLEX,
            name: 'Plex',
            mediaType: MediaType.BOTH,
            props: [
              {
                id: 39,
                name: 'collectionsIncludingSmart',
                humanName: 'Present in amount of other collections',
                mediaType: MediaType.BOTH,
                type: RuleType.NUMBER,
              },
            ],
          },
          {
            id: Application.JELLYFIN,
            name: 'Jellyfin',
            mediaType: MediaType.BOTH,
            props: [
              {
                id: 39,
                name: 'favoritedBy',
                humanName: '[list] Favorited by (username)',
                mediaType: MediaType.BOTH,
                type: RuleType.TEXT_LIST,
              },
            ],
          },
        ],
      } as RuleConstants;
    });

    it('names a media-server value after the configured server, not the stored app', () => {
      expect(
        service.getValueHumanName(
          [Application.PLEX, 39],
          MediaServerType.JELLYFIN,
        ),
      ).toBe('Jellyfin - [list] Favorited by (username)');
    });

    it('explains a missing value with the configured server property too', () => {
      expect(
        service.getValueNullReason(
          [Application.PLEX, 39],
          MediaServerType.JELLYFIN,
        ),
      ).toBe('Jellyfin Favorited by (username) has no entries for this item');
    });

    it('leaves the stored app alone when it already matches the server', () => {
      expect(
        service.getValueHumanName([Application.PLEX, 39], MediaServerType.PLEX),
      ).toBe('Plex - Present in amount of other collections');
    });

    it('leaves the stored app alone when the server is unknown', () => {
      expect(service.getValueHumanName([Application.PLEX, 39])).toBe(
        'Plex - Present in amount of other collections',
      );
    });
  });

  describe('getCustomValueFromIdentifier', () => {
    // The encoder emits the RuleType humanName, so a TEXT_LIST custom value
    // serialises as "text list" (with a space). The decoder must still resolve
    // it; otherwise the whole YAML import throws. Regression for the spaced key.
    it('resolves a spaced "text list" type to TEXT_LIST without throwing', () => {
      expect(
        service.getCustomValueFromIdentifier({
          type: 'text list',
          value: 'a,b',
        }),
      ).toEqual({ ruleTypeId: 4, value: 'a,b' });
    });

    it('resolves single-word custom value types', () => {
      expect(
        service.getCustomValueFromIdentifier({
          type: 'date',
          value: '2026-01-01',
        }),
      ).toEqual({ ruleTypeId: 1, value: '2026-01-01' });
      expect(
        service.getCustomValueFromIdentifier({ type: 'number', value: '5' }),
      ).toEqual({ ruleTypeId: 0, value: '5' });
    });
  });
});

describe('RuleConstanstService with the real rule constants', () => {
  // Uses the constructor-built RuleConstants so these round-trips break if the
  // shared studios property (id 46) is removed or renamed on any server.
  const service = new RuleConstanstService();

  it.each([
    [Application.PLEX, 'Plex.studios'],
    [Application.JELLYFIN, 'Jellyfin.studios'],
    [Application.EMBY, 'Emby.studios'],
  ])(
    'round-trips the studios identifier for application %i',
    (application, identifier) => {
      expect(service.getValueIdentifier([application, 46])).toBe(identifier);
      expect(service.getValueFromIdentifier(identifier)).toEqual([
        application,
        46,
      ]);
    },
  );
});
