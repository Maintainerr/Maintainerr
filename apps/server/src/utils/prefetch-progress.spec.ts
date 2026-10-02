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
});
