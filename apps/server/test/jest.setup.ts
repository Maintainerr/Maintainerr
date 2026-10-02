import { LoggerService } from '@nestjs/common';
import cacheManager from '../src/modules/api/lib/cache';

// Jest re-imports the module-level cacheManager for every spec file, and each
// node-cache instance keeps a check timer that holds that file's whole module
// graph in memory. Closing them lets the worker free it between files.
afterAll(() => {
  for (const cache of Object.values(cacheManager.getAllCaches())) {
    cache.data.close();
  }
});

jest.mock('@nestjs/common', () => {
  const Logger = function () {
    return {
      debug: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      fatal: jest.fn(),
      verbose: jest.fn(),
    } satisfies LoggerService;
  };

  // Nest calls these statics when a spec boots a real application; the real
  // Logger has them, so the stand-in needs them too.
  Logger.overrideLogger = jest.fn();
  Logger.flush = jest.fn();

  return {
    ...jest.requireActual('@nestjs/common'),
    Logger,
  };
});
