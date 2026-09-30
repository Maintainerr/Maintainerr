import { InternalServerErrorException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  it('fails the request when the configurations cannot be read', async () => {
    const controller = new NotificationsController(
      {
        getNotificationConfigurations: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
    );

    await expect(
      controller.getNotificationConfigurations(),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
