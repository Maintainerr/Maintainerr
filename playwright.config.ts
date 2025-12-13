import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Maintainerr E2E tests
 * Designed to test the Docker container startup and homepage availability
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:6246',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  timeout: 60000, // 60 seconds for each test
  expect: {
    timeout: 10000, // 10 seconds for expect assertions
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
