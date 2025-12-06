import { test, expect } from '@playwright/test';

/**
 * Docker Container Startup Tests
 * 
 * These tests verify that the Maintainerr Docker container starts correctly
 * and the homepage is accessible. This is particularly useful for testing
 * ARM builds in CI/CD pipelines.
 */

test.describe('Docker Container Startup', () => {
  test('should have working API health endpoint', async ({ request }) => {
    // Check if the API is responding
    const response = await request.get('/api/health');
    
    // The health endpoint should return 200 OK
    expect(response.ok()).toBeTruthy();
    
    // Verify the response body
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('should load the homepage or redirect without server errors', async ({ page }) => {
    // Navigate to the homepage
    const response = await page.goto('/');

    // The server should not return 500 errors (4xx is acceptable, e.g., 404 or redirects)
    // In production, the UI should be served. In development, it might 404.
    expect(response?.status()).toBeLessThan(500);

    // Verify no critical server error messages
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Internal Server Error');
    expect(pageContent).not.toContain('500 Error');
  });

  test('should have API endpoints responding', async ({ request }) => {
    // Test that the API is accessible
    // This endpoint should exist and return data or proper error
    const response = await request.get('/api/app/status');
    
    // Should get a response (even if it's an error due to no configuration)
    expect(response.status()).toBeLessThan(500);
  });
});
