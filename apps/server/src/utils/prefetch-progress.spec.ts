import { createPrefetchProgressReporter } from './prefetch-progress';

describe('createPrefetchProgressReporter', () => {
  const collect = () => {
    const lines: string[] = [];
    return {
      lines,
      report: createPrefetchProgressReporter(
        (m) => lines.push(m),
        'Prefetching watch history',
        'records',
      ),
    };
  };

  it('logs once per 10% boundary crossed, in order', () => {
    const { lines, report } = collect();
    for (let done = 1; done <= 100; done++) report(done, 100);

    expect(lines).toEqual([
      'Prefetching watch history: 10 of 100 records (10%)...',
      'Prefetching watch history: 20 of 100 records (20%)...',
      'Prefetching watch history: 30 of 100 records (30%)...',
      'Prefetching watch history: 40 of 100 records (40%)...',
      'Prefetching watch history: 50 of 100 records (50%)...',
      'Prefetching watch history: 60 of 100 records (60%)...',
      'Prefetching watch history: 70 of 100 records (70%)...',
      'Prefetching watch history: 80 of 100 records (80%)...',
      'Prefetching watch history: 90 of 100 records (90%)...',
    ]);
  });

  it('never reports the final unit, so it cannot precede a completion line with a partial percentage', () => {
    const { lines, report } = collect();
    report(100, 100);
    expect(lines).toEqual([]);
  });

  it('stays silent below the first decile', () => {
    const { lines, report } = collect();
    report(5, 100);
    report(9, 100);
    expect(lines).toEqual([]);
  });

  it('does not divide by an unknown total', () => {
    const { lines, report } = collect();
    report(5, 0);
    report(5, -1);
    expect(lines).toEqual([]);
  });

  it('skips straight to the reached decile when a page jumps several', () => {
    const { lines, report } = collect();
    report(35, 100);
    report(80, 100);
    expect(lines).toEqual([
      'Prefetching watch history: 35 of 100 records (30%)...',
      'Prefetching watch history: 80 of 100 records (80%)...',
    ]);
  });
});
