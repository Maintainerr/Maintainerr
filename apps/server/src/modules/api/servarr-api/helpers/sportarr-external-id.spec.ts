import { SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET } from '@maintainerr/contracts';
import {
  sportarrLeagueExternalIdFromProviderIds,
  sportarrLeagueExternalIdFromTvdbAlias,
} from './sportarr-external-id';

describe('sportarrLeagueExternalIdFromTvdbAlias', () => {
  it('reverses the frozen offset back to a zero-padded league id', () => {
    expect(sportarrLeagueExternalIdFromTvdbAlias(900_000_278)).toBe(
      'lg-000278',
    );
    expect(sportarrLeagueExternalIdFromTvdbAlias(900_001_521)).toBe(
      'lg-001521',
    );
  });

  it('keeps ids that grow past six digits unpadded beyond the pad width', () => {
    expect(sportarrLeagueExternalIdFromTvdbAlias(901_234_567)).toBe(
      'lg-1234567',
    );
  });

  it('uses the documented offset constant', () => {
    expect(SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET).toBe(900_000_000);
    expect(
      sportarrLeagueExternalIdFromTvdbAlias(
        SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET + 1,
      ),
    ).toBe('lg-000001');
  });

  it('accepts the top of the league alias range', () => {
    expect(sportarrLeagueExternalIdFromTvdbAlias(999_999_999)).toBe(
      'lg-99999999',
    );
  });

  it.each([
    undefined,
    null,
    NaN,
    0,
    900_000_000, // exactly the offset -> n === 0, not a league
    899_999_999, // below the league range (a real tvdb id space)
    1_000_000_000, // the event alias range, not a league
    342_040, // a genuine TVDB series id
    900_000_278.5, // aliases are integers; a fraction is not a league id
  ])('returns null for out-of-range value %s', (value) => {
    expect(sportarrLeagueExternalIdFromTvdbAlias(value as number)).toBeNull();
  });
});

describe('sportarrLeagueExternalIdFromProviderIds', () => {
  it('scans past non-alias entries to find the alias', () => {
    // An agent-matched item can carry a real TVDB guid ahead of the alias.
    expect(
      sportarrLeagueExternalIdFromProviderIds(['342040', '900000278']),
    ).toBe('lg-000278');
  });

  it('returns null when no entry is inside the alias range', () => {
    expect(
      sportarrLeagueExternalIdFromProviderIds(['342040', 'not-a-number']),
    ).toBeNull();
    expect(sportarrLeagueExternalIdFromProviderIds([])).toBeNull();
    expect(sportarrLeagueExternalIdFromProviderIds(undefined)).toBeNull();
  });
});
