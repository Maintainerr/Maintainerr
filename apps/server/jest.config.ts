import type { Config } from 'jest';
import { availableParallelism } from 'node:os';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2022',
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          keepClassNames: true,
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@nestjs|@octokit|octokit|bottleneck|@jellyfin/sdk|@faker-js/faker)/)',
    '/packages/contracts/dist/',
  ],
  collectCoverageFrom: ['**/*.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  // Half the cores, at most 4, so the same command runs on any machine: a
  // worker grows with every module it compiles, so more workers only add memory.
  maxWorkers: Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))),
  // Restart a worker whose heap passes this after a spec file, which bounds
  // that growth whatever the machine size (4 workers peak near 2 GB).
  workerIdleMemoryLimit: '256MB',
  setupFilesAfterEnv: ['<rootDir>/../test/jest.setup.ts'],
};

export default config;
