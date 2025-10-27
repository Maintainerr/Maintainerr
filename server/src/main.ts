import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import { setupGracefulShutdown } from 'nestjs-graceful-shutdown';
import { patchNestJsSwagger } from 'nestjs-zod';
import path from 'path';
import { AppModule } from './app/app.module';

import { MaintainerrLogger } from './modules/logging/logs.service';

const dataDir =
  process.env.NODE_ENV === 'production'
    ? process.env.DATA_DIR
    : path.join(__dirname, '../../data');

const appDir =
  process.env.NODE_ENV === 'production'
    ? process.env.APP_DIR
    : path.join(__dirname, '../../');

patchNestJsSwagger();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  setupGracefulShutdown({ app });

  const config = new DocumentBuilder().setTitle('Maintainerr').build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/swagger', app, documentFactory);

  app.useLogger(await app.resolve(MaintainerrLogger));
  app.enableCors({ origin: true });

  const configService = app.get(ConfigService);
  const apiPort = configService.get<number>('API_PORT');

  await app.listen(apiPort);
}

function createDataDirectoryStructure() {
  // Validate that APP_DIR is correct
  if (!fs.existsSync(path.join(appDir, 'server'))) {
    console.error(
      `Could not locate the server app folder in: ${appDir}. Please make sure APP_DIR is set correctly.`,
    );
    process.exit(1);
  }

  try {
    // Check if data directory has read and write permissions
    fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);

    // create logs dir
    const dir = path.join(dataDir, 'logs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {
        recursive: true,
        mode: 0o777,
      });
    }

    // if db already exists, check r/w permissions
    const db = path.join(dataDir, 'maintainerr.sqlite');
    if (fs.existsSync(db)) {
      fs.accessSync(db, fs.constants.R_OK | fs.constants.W_OK);
    }
  } catch (err) {
    console.error(
      `Could not create or access (files in) the data directory: ${dataDir}. Please make sure the necessary permissions are set. Refer to the documentation for more information: https://docs.maintainerr.info/latest/Installation/`,
    );
    process.exit(1);
  }
}

createDataDirectoryStructure();
bootstrap();

process
  .on('unhandledRejection', (err) => {
    new Logger('main').error(
      'An unhandledRejection has occurred. This is likely a bug, please report this issue on GitHub.',
      err,
    );
    // We do not exit the process here as the error is unlikely to be fatal.
  })
  .on('uncaughtException', (err) => {
    new Logger('main').error(
      'The server has crashed because of an uncaughtException. This is likely a bug, please report this issue on GitHub.',
      err,
    );
    process.exit(1);
  });
