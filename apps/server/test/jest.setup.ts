import { LoggerService } from '@nestjs/common';

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
