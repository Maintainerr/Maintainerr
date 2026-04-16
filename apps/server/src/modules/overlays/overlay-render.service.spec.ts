import { registerFont } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import { createMockLogger } from '../../../test/utils/data';
import { dataDir } from '../../app/config/dataDir';
import { OverlayRenderService } from './overlay-render.service';

jest.mock('canvas', () => {
  const actual = jest.requireActual('canvas');
  return { ...actual, registerFont: jest.fn() };
});

// `fs.existsSync` is non-configurable on Node, so `jest.spyOn` and
// `jest.replaceProperty` both fail here. Module-level replacement is the
// only viable route; `afterEach` restores the real implementation so tests
// don't leak into each other.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, existsSync: jest.fn(actual.existsSync) };
});

const realExistsSync = jest.requireActual('fs')
  .existsSync as typeof fs.existsSync;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;

describe('OverlayRenderService', () => {
  afterEach(() => {
    mockedExistsSync.mockImplementation(realExistsSync);
    jest.clearAllMocks();
  });

  it('prefers uploaded fonts over bundled fonts when filenames collide', () => {
    const logger = createMockLogger();
    const service = new OverlayRenderService(logger);
    const userPath = path.resolve(
      dataDir,
      'overlays',
      'fonts',
      'Inter-Bold.ttf',
    );
    const bundledPath = path.resolve('/bundled-fonts', 'Inter-Bold.ttf');

    Object.defineProperty(service, 'bundledFontsDir', {
      value: '/bundled-fonts',
      configurable: true,
      writable: true,
    });

    mockedExistsSync.mockImplementation(
      (candidate) => candidate === userPath || candidate === bundledPath,
    );

    const family = (service as any).getFontFamily('Inter-Bold.ttf');

    expect(family).toBe('Inter-Bold');
    expect(registerFont).toHaveBeenCalledWith(userPath, {
      family: 'Inter-Bold',
    });
  });

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
