import { test, expect } from '@playwright/test';

/**
 * Docker Container Startup Tests
 * 
 * These tests verify that the Maintainerr Docker container starts correctly
 * and the homepage is accessible. This is particularly useful for testing
 * ARM builds in CI/CD pipelines.
 */

test.describe('Docker Container Startup', () => {
  test('should load the homepage successfully', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for the page to be fully loaded
    await page.waitForLoadState('domcontentloaded');

    // Check that we get a successful response (not a 500 error page)
    const title = await page.title();
    expect(title).toBeTruthy();

    // Verify the page contains expected content
    // The Maintainerr app should render without errors
    const body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should not display critical errors on homepage', async ({ page }) => {
    // Navigate to the homepage
    const response = await page.goto('/');

    // Verify we get a 200 OK response
    expect(response?.status()).toBe(200);

    // Check for common error indicators
    const pageContent = await page.content();
    
    // These error messages should not appear on a healthy homepage
    expect(pageContent).not.toContain('Cannot GET');
    expect(pageContent).not.toContain('Internal Server Error');
    expect(pageContent).not.toContain('500 Error');
  });

  test('should have working API health endpoint', async ({ request }) => {
    // Check if the API is responding
    const response = await request.get('/api/health');
    
    // The health endpoint should return 200 OK
    expect(response.ok()).toBeTruthy();
  });
});
