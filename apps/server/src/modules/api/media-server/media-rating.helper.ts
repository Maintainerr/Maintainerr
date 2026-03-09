import { MediaRating } from '@maintainerr/contracts';

export type MediaRatingProvider = 'imdb' | 'rottentomatoes' | 'tmdb';

type MediaRatingType = NonNullable<MediaRating['type']>;

const MEDIA_RATING_PROVIDER_SOURCES: Record<MediaRatingProvider, string[]> = {
  imdb: ['imdb'],
  rottentomatoes: ['rottentomatoes'],
  tmdb: ['themoviedb', 'tmdb'],
};

interface MediaRatingLookupOptions {
  type: MediaRatingType;
  preferredSources: string[];
  fallbackSources?: string[];
}

interface ExternalMediaRatingLookupOptions {
  provider: MediaRatingProvider;
  type: MediaRatingType;
  fallbackSources?: string[];
}

export function getExternalMediaRatingValue(
  ratings: MediaRating[] | undefined,
  options: ExternalMediaRatingLookupOptions,
): number | null {
  return getMediaRatingValue(ratings, {
    type: options.type,
    preferredSources: MEDIA_RATING_PROVIDER_SOURCES[options.provider],
    fallbackSources: options.fallbackSources,
  });
}

export function getMediaRatingValue(
  ratings: MediaRating[] | undefined,
  options: MediaRatingLookupOptions,
): number | null {
  if (!ratings?.length) {
    return null;
  }

  const preferredMatch = findMediaRating(ratings, {
    type: options.type,
    sources: options.preferredSources,
  });

  if (preferredMatch) {
    return preferredMatch.value;
  }

  const fallbackMatch = findMediaRating(ratings, {
    type: options.type,
    sources: options.fallbackSources ?? [],
  });

  return fallbackMatch?.value ?? null;
}

interface FindMediaRatingOptions {
  type: MediaRatingType;
  sources: string[];
}

function findMediaRating(
  ratings: MediaRating[],
  options: FindMediaRatingOptions,
): MediaRating | undefined {
  if (!options.sources.length) {
    return undefined;
  }

  return ratings.find(
    (rating) =>
      rating.type === options.type &&
      hasMediaRatingSource(rating.source, options.sources),
  );
}

function hasMediaRatingSource(
  source: string | undefined,
  sources: string[],
): boolean {
  if (!source) {
    return false;
  }

  const normalizedSource = source.toLowerCase();
  return sources.some((candidate) => normalizedSource.startsWith(candidate));
}
