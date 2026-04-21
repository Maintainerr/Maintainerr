import axios from 'axios';
import axiosRetry from 'axios-retry';
import PlexApi from './plexApi';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}));

jest.mock('axios-retry', () => ({
  __esModule: true,
  default: jest.fn(),
  exponentialDelay: jest.fn(),
}));

describe('PlexApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue({
      request: jest.fn(),
    });
  });

  it('uses token-only default Plex headers until richer identity headers are proven safe', () => {
    new PlexApi({
      hostname: 'plex.local',
      port: 32400,
      token: 'token',
    });

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://plex.local:32400',
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': 'token',
        },
      }),
    );

    const headers = (axios.create as jest.Mock).mock.calls[0][0].headers;
    expect(headers['X-Plex-Product']).toBeUndefined();
    expect(headers['X-Plex-Version']).toBeUndefined();
    expect(headers['X-Plex-Client-Identifier']).toBeUndefined();
    expect(axiosRetry).toHaveBeenCalledTimes(1);
  });
});