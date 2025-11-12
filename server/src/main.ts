import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { setupGracefulShutdown } from '@tygra/nestjs-graceful-shutdown';
import * as fs from 'fs';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import path from 'path';
import { AppModule } from './app/app.module';
import { MaintainerrLogger } from './modules/logging/logs.service';

const dataDir =
  process.env.NODE_ENV === 'production'
    ? '/opt/data'
    : path.join(__dirname, '../../data');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  setupGracefulShutdown({ app });

  const config = new DocumentBuilder().setTitle('Maintainerr').build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  const document = documentFactory();
  cleanupOpenApiDoc(document);
  SwaggerModule.setup('api/swagger', app, document);

  app.useLogger(await app.resolve(MaintainerrLogger));
  app.enableCors({ origin: true });

  const apiPort = process.env.API_PORT || 3001;
  await app.listen(apiPort);
}

function createDataDirectoryStructure() {
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
    console.warn(
      `THE CONTAINER NO LONGER OPERATES WITH PRIVILEGED USER PERMISSIONS. PLEASE UPDATE YOUR CONFIGURATION ACCORDINGLY: https://github.com/Maintainerr/Maintainerr/releases/tag/v2.0.0`,
    );
    console.error(
      'Could not create or access (files in) the data directory. Please make sure the necessary permissions are set',
    );
    process.exit(1);
  }
}

createDataDirectoryStructure();
bootstrap().catch((error) => {
  console.error(
    'A fatal error occurred starting the server. This is likely a bug, please report this issue on GitHub.',
    { error },
  );
  process.exit(1);
});

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
    process.exit(2);
  });
