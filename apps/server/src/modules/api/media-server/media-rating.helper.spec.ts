import {
  getExternalMediaRatingValue,
  getMediaRatingValue,
} from './media-rating.helper';

describe('media-rating.helper', () => {
  it('returns the preferred provider rating when it exists', () => {
    const result = getMediaRatingValue(
      [
        { source: 'themoviedb://image.rating', value: 7.7, type: 'audience' },
        { source: 'imdb://image.rating', value: 8.2, type: 'audience' },
      ],
      {
        type: 'audience',
        preferredSources: ['imdb'],
      },
    );

    expect(result).toBe(8.2);
  });

  it('falls back to generic sources when no provider-specific source exists', () => {
    const result = getMediaRatingValue(
      [{ source: 'community', value: 8.4, type: 'audience' }],
      {
        type: 'audience',
        preferredSources: ['imdb'],
        fallbackSources: ['community'],
      },
    );

    expect(result).toBe(8.4);
  });

  it('returns null when no matching rating exists', () => {
    const result = getMediaRatingValue(
      [{ source: 'critic', value: 9.1, type: 'critic' }],
      {
        type: 'audience',
        preferredSources: ['imdb'],
        fallbackSources: ['community'],
      },
    );

    expect(result).toBeNull();
  });

  it('maps cross-server provider aliases through the external rating helper', () => {
    const result = getExternalMediaRatingValue(
      [{ source: 'themoviedb://image.rating', value: 7.7, type: 'audience' }],
      {
        provider: 'tmdb',
        type: 'audience',
      },
    );

    expect(result).toBe(7.7);
  });
});
