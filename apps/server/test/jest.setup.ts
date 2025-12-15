import { LoggerService } from '@nestjs/common';

jest.mock('@nestjs/common', () => {
  return {
    ...jest.requireActual('@nestjs/common'),
    Logger: function () {
      return {
        debug: jest.fn(),
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        fatal: jest.fn(),
        verbose: jest.fn(),
      } satisfies LoggerService;
    },
  };
});
