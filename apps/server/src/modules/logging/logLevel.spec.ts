import { LOG_LEVELS } from '@maintainerr/contracts';
import { resolveLogLevel } from './logLevel';

describe('resolveLogLevel', () => {
  it('uses the persisted level when LOG_LEVEL is unset', () => {
    expect(resolveLogLevel(undefined, 'warn')).toEqual({ level: 'warn' });
  });

  it('lets a recognised LOG_LEVEL override the persisted level', () => {
    expect(resolveLogLevel('debug', 'info')).toEqual({ level: 'debug' });
  });

  it('normalises case and surrounding whitespace', () => {
    expect(resolveLogLevel('  DEBUG  ', 'info')).toEqual({ level: 'debug' });
  });

  it('treats an empty / whitespace-only LOG_LEVEL as unset', () => {
    expect(resolveLogLevel('   ', 'error')).toEqual({ level: 'error' });
  });

  it('falls back to the persisted level and reports an unrecognised value', () => {
    expect(resolveLogLevel('not-a-level', 'info')).toEqual({
      level: 'info',
      invalidEnvValue: 'not-a-level',
    });
  });

  it('accepts every level advertised by the contract', () => {
    for (const level of LOG_LEVELS) {
      expect(resolveLogLevel(level, 'info')).toEqual({ level });
    }
  });
});
