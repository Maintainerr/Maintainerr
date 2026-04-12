import { Application, MediaType } from '@maintainerr/contracts';
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
});
