import { HttpException, StreamableFile } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { createMockLogger } from '../../../test/utils/data';
import { OverlaysController } from './overlays.controller';

jest.mock('sharp', () =>
  jest.fn(() => ({
    metadata: jest.fn(),
  })),
);

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    createReadStream: jest.fn(() => 'stream'),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

const mockedCreateReadStream = fs.createReadStream as jest.MockedFunction<
  typeof fs.createReadStream
>;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;
const mockedMkdirSync = fs.mkdirSync as jest.MockedFunction<
  typeof fs.mkdirSync
>;
const mockedReaddirSync = fs.readdirSync as jest.MockedFunction<
  typeof fs.readdirSync
>;
const mockedWriteFileSync = fs.writeFileSync as jest.MockedFunction<
  typeof fs.writeFileSync
>;
const mockedSharp = sharp as jest.MockedFunction<typeof sharp>;

describe('OverlaysController', () => {
  let controller: OverlaysController;

  beforeEach(() => {
    mockedCreateReadStream.mockClear();
    mockedExistsSync.mockReset();
    mockedMkdirSync.mockClear();
    mockedReaddirSync.mockReset();
    mockedWriteFileSync.mockClear();
    mockedSharp.mockReset();
    mockedExistsSync.mockReturnValue(false);

    controller = new OverlaysController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      createMockLogger(),
    );

    Object.defineProperty(controller, 'fontsDir', {
      configurable: true,
      value: '/bundled-fonts',
      writable: true,
    });
  });

  it('returns 400 for unsafe font names', () => {
    const response = { setHeader: jest.fn() } as any;

    try {
      controller.getFont('../escape.ttf', response);
      fail('expected getFont to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(400);
    }
  });

  it('returns 404 when the font does not exist', () => {
    const response = { setHeader: jest.fn() } as any;

    try {
      controller.getFont('Missing.ttf', response);
      fail('expected getFont to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(404);
    }
  });

  it.each([
    ['Inter-Bold.ttf', 'font/ttf'],
    ['Inter-Bold.otf', 'font/otf'],
    ['Inter-Bold.woff', 'font/woff'],
  ])('serves %s with the correct content type', (name, contentType) => {
    const response = { setHeader: jest.fn() } as any;
    const bundledPath = path.join('/bundled-fonts', name);

    mockedExistsSync.mockImplementation(
      (candidate) => candidate === bundledPath,
    );

    const result = controller.getFont(name, response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      contentType,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=3600',
    );
    expect(mockedCreateReadStream).toHaveBeenCalledWith(bundledPath);
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('treats unsupported font extensions as missing', () => {
    const response = { setHeader: jest.fn() } as any;
    const bundledPath = path.join('/bundled-fonts', 'Inter-Bold.woff2');

    mockedExistsSync.mockImplementation(
      (candidate) => candidate === bundledPath,
    );

    try {
      controller.getFont('Inter-Bold.woff2', response);
      fail('expected getFont to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(404);
    }

    expect(mockedCreateReadStream).not.toHaveBeenCalled();
  });

  it('rejects uploads for unsupported font extensions', async () => {
    await expect(
      controller.uploadFont({
        originalname: 'Inter-Bold.woff2',
        buffer: Buffer.from('font'),
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: 'Only .ttf, .otf, and .woff font files are supported',
    });

    expect(mockedMkdirSync).not.toHaveBeenCalled();
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('persists supported font uploads to the overlays font directory', async () => {
    const result = await controller.uploadFont({
      originalname: 'Inter-Bold.ttf',
      buffer: Buffer.from('font'),
    });

    expect(mockedMkdirSync).not.toHaveBeenCalled();
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('overlays', 'fonts', 'Inter-Bold.ttf')),
      expect.any(Buffer),
    );
    expect(result).toEqual(
      expect.objectContaining({
        name: 'Inter-Bold.ttf',
        path: expect.stringContaining(
          path.join('overlays', 'fonts', 'Inter-Bold.ttf'),
        ),
      }),
    );
  });

  it('omits unsafe filenames from the font picker', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'Inter-Bold.ttf',
      'My Font.ttf',
      '../escape.ttf',
      'subdir/nested.ttf',
      'Inter-Bold.woff2',
    ] as unknown as ReturnType<typeof fs.readdirSync>);

    const result = controller.listFonts();

    expect(result.map((entry) => entry.name)).toEqual(['Inter-Bold.ttf']);
  });

  it('omits unsafe filenames from the image picker', () => {
    mockedReaddirSync.mockReturnValue([
      'safe.png',
      'My Logo.png',
      '../escape.png',
      'subdir/nested.png',
      'logo.svg',
    ] as unknown as ReturnType<typeof fs.readdirSync>);

    const result = controller.listImages();

    expect(result.map((entry) => entry.name)).toEqual(['safe.png']);
  });

  it('rejects image uploads when bytes do not match the file extension', async () => {
    mockedSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ format: 'png' }),
    } as any);

    await expect(
      controller.uploadImage({
        originalname: 'poster.jpg',
        buffer: Buffer.from('image'),
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: 'File contents (png) do not match the file extension',
    });

    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('persists supported image uploads to the overlays image directory', async () => {
    mockedSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ format: 'png' }),
    } as any);

    const result = await controller.uploadImage({
      originalname: 'poster.png',
      buffer: Buffer.from('image'),
    });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('overlays', 'images', 'poster.png')),
      expect.any(Buffer),
    );
    expect(result).toEqual(
      expect.objectContaining({
        name: 'poster.png',
        path: expect.stringContaining(
          path.join('overlays', 'images', 'poster.png'),
        ),
      }),
    );
  });
});
