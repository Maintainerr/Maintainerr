import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';

describe('MetadataController', () => {
  const metadataService = {
    getBackdropUrl: jest.fn(),
    getPosterUrl: jest.fn(),
  } as unknown as jest.Mocked<MetadataService>;

  let controller: MetadataController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MetadataController(metadataService);
  });

  it('maps image query params into provider IDs', async () => {
    await controller.getImage('show', {
      tmdbId: '123',
      tvdbId: '456',
      imdbId: 'tt1234567',
    });

    expect(metadataService.getPosterUrl).toHaveBeenCalledWith(
      {
        tmdb: 123,
        tvdb: 456,
        imdb: 'tt1234567',
      },
      'tv',
      'w300_and_h450_face',
    );
  });

  it('maps backdrop params and movie/show types correctly', async () => {
    await controller.getBackdropImage('movie', { tmdbId: '123' });

    expect(metadataService.getBackdropUrl).toHaveBeenCalledWith(
      { tmdb: 123 },
      'movie',
    );
  });

  it('returns undefined when no provider IDs were provided', async () => {
    await expect(controller.getImage('movie', {})).resolves.toBeUndefined();
    expect(metadataService.getPosterUrl).not.toHaveBeenCalled();
  });
});
