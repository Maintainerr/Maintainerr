import { DynamicModule, INestApplication } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { AddressInfo } from 'net';
import path from 'path';
import { AppModule } from './app.module';
import { dataDir } from './config/dataDir';

jest.mock('./config/dataDir', () => {
  const fs = jest.requireActual<typeof import('fs')>('fs');
  const os = jest.requireActual<typeof import('os')>('os');
  const nodePath = jest.requireActual<typeof import('path')>('path');
  return {
    ...jest.requireActual<object>('./config/dataDir'),
    dataDir: fs.mkdtempSync(nodePath.join(os.tmpdir(), 'ui-')),
  };
});

describe('AppModule UI serving under BASE_PATH', () => {
  const { NODE_ENV, BASE_PATH } = process.env;
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.BASE_PATH = '/maint';
    mkdirSync(path.join(dataDir, 'ui'));
    writeFileSync(path.join(dataDir, 'ui', 'index.html'), '<!doctype html>');

    // The ServeStaticModule entry AppModule itself imports, booted alone.
    // NestFactory rather than @nestjs/testing: a testing module resolves the
    // static loader before the HTTP adapter exists and gets a no-op one.
    const imports: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    );
    const serveStatic = imports.find(
      (entry) => (entry as DynamicModule)?.module === ServeStaticModule,
    ) as DynamicModule;
    app = await NestFactory.create(
      { module: class UiModule {}, imports: [serveStatic] },
      { logger: false },
    );
    app.setGlobalPrefix('maint');
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
    rmSync(dataDir, { recursive: true, force: true });
    process.env.NODE_ENV = NODE_ENV;
    if (BASE_PATH === undefined) {
      delete process.env.BASE_PATH;
    } else {
      process.env.BASE_PATH = BASE_PATH;
    }
  });

  it.each([
    {
      route: 'a UI route',
      url: '/maint/overview',
      status: 200,
      type: 'text/html',
    },
    {
      route: 'an unknown API route',
      url: '/maint/api/does-not-exist',
      status: 404,
      type: 'application/json',
    },
  ])('answers $route with $status $type', async ({ url, status, type }) => {
    const response = await fetch(baseUrl + url);

    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toContain(type);
  });
});
