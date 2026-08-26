import {
  isSportarrTvdbAlias,
  SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET,
} from '@maintainerr/contracts';
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

  it('rejects the offset itself, which the shared predicate excludes too', () => {
    expect(isSportarrTvdbAlias(SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET)).toBe(false);
    expect(
      sportarrLeagueExternalIdFromTvdbAlias(SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET),
    ).toBeNull();
    expect(isSportarrTvdbAlias(SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET + 1)).toBe(
      true,
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
  it('prefers the native sportarr id over the tvdb alias', () => {
    expect(
      sportarrLeagueExternalIdFromProviderIds({
        sportarr: ['lg-000278'],
        tvdb: ['900000999'],
      }),
    ).toBe('lg-000278');
  });

  it('canonicalises the stamped id, which is matched against Sportarr by string', () => {
    expect(
      sportarrLeagueExternalIdFromProviderIds({ sportarr: [' LG-278 '] }),
    ).toBe('lg-000278');
  });

  it('falls back to the tvdb alias for a show refreshed before the native id existed', () => {
    expect(
      sportarrLeagueExternalIdFromProviderIds({ tvdb: ['900000278'] }),
    ).toBe('lg-000278');
  });

  it.each([
    'ev-848683', // an event, stamped on episodes, never a league
    '900000278', // the tvdb alias digits, not a native id
    'lg-', // no digits
    'lg-000000', // league 0 does not exist
    'lg-12ab',
    'league-278',
  ])('ignores %s in the sportarr namespace and reads the alias', (value) => {
    expect(
      sportarrLeagueExternalIdFromProviderIds({
        sportarr: [value],
        tvdb: ['900000278'],
      }),
    ).toBe('lg-000278');
  });

  it('scans past non-alias tvdb entries to find the alias', () => {
    // An agent-matched item can carry a real TVDB guid ahead of the alias.
    expect(
      sportarrLeagueExternalIdFromProviderIds({
        tvdb: ['342040', '900000278'],
      }),
    ).toBe('lg-000278');
  });

  it('returns null when nothing identifies a league', () => {
    expect(
      sportarrLeagueExternalIdFromProviderIds({
        sportarr: ['ev-848683'],
        tvdb: ['342040', 'not-a-number'],
      }),
    ).toBeNull();
    expect(sportarrLeagueExternalIdFromProviderIds({})).toBeNull();
    expect(sportarrLeagueExternalIdFromProviderIds(undefined)).toBeNull();
  });
});
