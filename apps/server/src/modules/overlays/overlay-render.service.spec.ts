import { createMockLogger } from '../../../test/utils/data';
import { OverlayRenderService } from './overlay-render.service';

describe('OverlayRenderService', () => {
  it('escapes unsafe font paths before logging them', () => {
    const logger = createMockLogger();
    const service = new OverlayRenderService(logger);

    (service as any).getFontFamily('..\nsecret.ttf');

    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected unsafe font path: "..\\nsecret.ttf"',
    );
  });

  it('escapes unsafe image paths before logging them', async () => {
    const logger = createMockLogger();
    const service = new OverlayRenderService(logger);

    await (service as any).renderImageElement(
      {
        id: 'image-1',
        type: 'image',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rotation: 0,
        layerOrder: 0,
        opacity: 1,
        visible: true,
        imagePath: '..\nsecret.png',
      },
      10,
      10,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected unsafe image path: "..\\nsecret.png"',
    );
  });
});
