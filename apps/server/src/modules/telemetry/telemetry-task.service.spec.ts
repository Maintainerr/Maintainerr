import { Mocked, TestBed } from '@suites/unit';
import { isValidCron } from 'cron-validator';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsDataService } from '../settings/settings-data.service';
import { TasksService } from '../tasks/tasks.service';
import { TelemetryService } from './telemetry.service';
import { TelemetryTaskService } from './telemetry-task.service';

/** Reach the protected members TaskBase exposes to Nest, not to callers. */
interface TaskInternals {
  cronSchedule: string;
  onBootstrapHook(): void;
  executeTask(): Promise<void>;
}

describe('TelemetryTaskService', () => {
  let internals: TaskInternals;
  let settings: Mocked<SettingsDataService>;
  let telemetry: Mocked<TelemetryService>;

  const scheduleFor = (clientId: string | undefined): string => {
    settings.clientId = clientId;
    internals.onBootstrapHook();
    return internals.cronSchedule;
  };

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(TelemetryTaskService).compile();
    internals = unit as unknown as TaskInternals;

    settings = unitRef.get(SettingsDataService);
    telemetry = unitRef.get(TelemetryService);
    unitRef.get(TasksService);
    unitRef.get(MaintainerrLogger);

    telemetry.send.mockResolvedValue(undefined);
  });

  describe('weekly jitter slot', () => {
    it('produces a valid weekly cron expression', () => {
      const cron = scheduleFor('6f2a1c40-9d3e-4a17-8b52-0c7e1d9a4f38');

      expect(isValidCron(cron)).toBe(true);
      const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.split(' ');
      expect(Number(minute)).toBeGreaterThanOrEqual(0);
      expect(Number(minute)).toBeLessThan(60);
      expect(Number(hour)).toBeGreaterThanOrEqual(0);
      expect(Number(hour)).toBeLessThan(24);
      expect(dayOfMonth).toBe('*');
      expect(month).toBe('*');
      expect(Number(dayOfWeek)).toBeGreaterThanOrEqual(0);
      expect(Number(dayOfWeek)).toBeLessThan(7);
    });

    it('falls back without throwing when there is no clientId', () => {
      const cron = scheduleFor(undefined);

      expect(isValidCron(cron)).toBe(true);
      expect(cron).toBe('0 0 * * 0');
    });

    /**
     * The failure this guards against is a hash whose components collapse the
     * slot space: taking minute, hour and day from hash % 60 / % 24 / % 7
     * correlates minute and hour mod 12 and leaves only 840 reachable slots,
     * bunching instances into shared minutes.
     */
    it('spreads instances across the weekly slot space', () => {
      const days = new Set<string>();
      const minutesOfDay = new Set<number>();
      const slots = new Set<string>();

      // A deterministic id generator, so the distribution asserted here is the
      // same on every run.
      let seed = 12345;
      const nextHex = () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return '0123456789abcdef'[Math.floor((seed / 4294967296) * 16)];
      };
      const nextClientId = () => {
        let id = '';
        for (let i = 0; i < 32; i++) {
          id += nextHex();
          if (i === 7 || i === 11 || i === 15 || i === 19) id += '-';
        }
        return id;
      };

      for (let i = 0; i < 3000; i++) {
        const [minute, hour, , , day] = scheduleFor(nextClientId()).split(' ');
        days.add(day);
        minutesOfDay.add(Number(hour) * 60 + Number(minute));
        slots.add(`${day} ${hour} ${minute}`);
      }

      expect(days.size).toBe(7);
      expect(minutesOfDay.size).toBeGreaterThan(1000);
      // Comfortably past the 840 a correlated hash would be limited to.
      expect(slots.size).toBeGreaterThan(2000);
    });
  });

  describe('sampling', () => {
    it('asks the service whether this run carries the sample', async () => {
      telemetry.sampledOn.mockReturnValue(false);

      await internals.executeTask();

      expect(telemetry.send).toHaveBeenCalledWith(false);
    });
  });
});
