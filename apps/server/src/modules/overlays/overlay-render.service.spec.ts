import { registerFont } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
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

type TemplateElements = Parameters<
  OverlayRenderService['renderFromTemplate']
>[1];

const isRedPixel = (
  data: Buffer,
  width: number,
  channels: number,
  x: number,
  y: number,
) => {
  const offset = (y * width + x) * channels;
  return data[offset] > 170 && data[offset + 1] < 90 && data[offset + 2] < 90;
};

const isDarkPixel = (
  data: Buffer,
  width: number,
  channels: number,
  x: number,
  y: number,
) => {
  const offset = (y * width + x) * channels;
  return data[offset] < 80 && data[offset + 1] < 80 && data[offset + 2] < 80;
};

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

  it('scales template shape stroke widths to match the target artwork size', async () => {
    const logger = createMockLogger();
    const service = new OverlayRenderService(logger);
    const posterBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .toBuffer();
    const elements: TemplateElements = [
      {
        id: 'scaled-frame',
        type: 'shape',
        x: 20,
        y: 20,
        width: 60,
        height: 60,
        rotation: 0,
        layerOrder: 0,
        opacity: 1,
        visible: true,
        shapeType: 'rectangle',
        fillColor: 'transparent',
        strokeColor: '#ff0000',
        strokeWidth: 4,
        cornerRadius: 0,
      },
    ];

    const result = await service.renderFromTemplate(
      posterBuffer,
      elements,
      100,
      100,
      {
        deleteDate: new Date('2026-04-27T00:00:00.000Z'),
        daysLeft: 14,
      },
    );
    const { data, info } = await sharp(Buffer.from(result.buffer))
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(isRedPixel(data, info.width, info.channels, 100, 42)).toBe(true);
    expect(isRedPixel(data, info.width, info.channels, 100, 48)).toBe(false);
  });

  it('uses uniform scaling (min axis) for style values when aspect ratio differs (issue #3025)', async () => {
    const logger = createMockLogger();
    const service = new OverlayRenderService(logger);

    // Poster with non-square aspect ratio
    const posterBuffer = await sharp({
      create: {
        width: 200,
        height: 400,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .toBuffer();

    const elements: TemplateElements = [
      {
        id: 'text-1',
        type: 'text',
        x: 10,
        y: 10,
        width: 80,
        height: 20,
        rotation: 0,
        layerOrder: 0,
        opacity: 1,
        visible: true,
        text: 'Sample',
        fontFamily: 'sans-serif',
        fontPath: '',
        fontSize: 12,
        fontColor: '#000000',
        fontWeight: 'normal',
        textAlign: 'left',
        verticalAlign: 'middle',
        backgroundColor: null,
        backgroundRadius: 0,
        backgroundPadding: 0,
        shadow: false,
        uppercase: false,
      },
    ];

    // spy on the private renderer to capture the scale value passed
    const spy = jest.spyOn(service as any, 'renderTextElement' as any);

    await service.renderFromTemplate(posterBuffer, elements, 100, 100, {
      deleteDate: new Date('2026-04-27T00:00:00.000Z'),
      daysLeft: 14,
    });

    // scaleX = 200/100 = 2, scaleY = 400/100 = 4 -> uniformScale = 2
    expect(spy).toHaveBeenCalled();
    const calledWith = spy.mock.calls[0];
    expect(calledWith[3]).toBe(2);
  });

  it('rotates elements around top-left pivot to preserve template placement', async () => {
    const logger = createMockLogger();
    const service = new OverlayRenderService(logger);
    const posterBuffer = await sharp({
      create: {
        width: 200,
        height: 400,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .toBuffer();

    const elements: TemplateElements = [
      {
        id: 'rotated-shape',
        type: 'shape',
        x: 50,
        y: 50,
        width: 100,
        height: 40,
        rotation: 90,
        layerOrder: 0,
        opacity: 1,
        visible: true,
        shapeType: 'rectangle',
        fillColor: '#000000',
        strokeColor: 'transparent',
        strokeWidth: 0,
        cornerRadius: 0,
      },
    ];

    const result = await service.renderFromTemplate(
      posterBuffer,
      elements,
      100,
      100,
      {
        deleteDate: new Date('2026-04-27T00:00:00.000Z'),
        daysLeft: 14,
      },
    );

    const { data, info } = await sharp(Buffer.from(result.buffer))
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(isDarkPixel(data, info.width, info.channels, 30, 220)).toBe(true);
  });
});
