import { InternalServerErrorException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  const createController = (configurations: unknown) =>
    new NotificationsController(
      {
        getNotificationConfigurations: jest
          .fn()
          .mockResolvedValue(configurations),
      } as any,
      {} as any,
    );

  it('fails the request when the configurations cannot be read', async () => {
    await expect(
      createController(undefined).getNotificationConfigurations(),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('returns an empty list as an empty list', async () => {
    await expect(
      createController([]).getNotificationConfigurations(),
    ).resolves.toEqual([]);
  });
});
