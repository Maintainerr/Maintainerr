import { MediaWatchStats } from '@maintainerr/contracts';
import { BadGatewayException, NotFoundException } from '@nestjs/common';

/**
 * The status contract the media modal reads from every statistics service:
 * 404 for an item nobody played, 502 when the service could not be read.
 */
export const watchStatsOrThrow = (
  stats: MediaWatchStats | null | undefined,
  service: string,
): MediaWatchStats => {
  if (stats === undefined) {
    throw new BadGatewayException(`${service} could not be read`);
  }
  if (!stats) {
    throw new NotFoundException(`No ${service} data available for this item`);
  }
  return stats;
};
