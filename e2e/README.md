# E2E Tests

This directory contains end-to-end tests for Maintainerr using Playwright. These tests are designed to verify that the Docker container starts correctly and the application is accessible.

## Purpose

The E2E tests serve multiple purposes:

1. **Docker Startup Validation**: Verify that the Docker image builds and starts correctly
2. **ARM Architecture Testing**: Run tests on both AMD64 and ARM64 platforms in CI/CD
3. **Homepage Accessibility**: Ensure the web interface loads without critical errors
4. **API Health Checks**: Verify that the API endpoints are responding correctly
5. **Future E2E Tests**: Foundation for adding more comprehensive end-to-end testing

## Running Tests Locally

### Prerequisites

- Docker installed and running
- Node.js 20.19.0+ or 22.12.0+
- Yarn 4.11.0+ (managed via corepack)

### Quick Start

1. **Run tests against a Docker container**:
   ```bash
   yarn test:e2e:docker
   ```
   This will:
   - Build the Docker image
   - Start the container
   - Wait for it to be healthy
   - Run the Playwright tests
   - Clean up the container

2. **Run tests against an existing instance**:
   ```bash
   # Start your instance manually, then:
   BASE_URL=http://localhost:6246 yarn test:e2e
   ```

3. **Run tests in UI mode** (for development):
   ```bash
   # Start your instance first, then:
   yarn test:e2e:ui
   ```

### Manual Setup

If you prefer to run each step manually:

```bash
# 1. Build the Docker image
docker build -t maintainerr-e2e:test .

# 2. Create and prepare the data directory with proper permissions
mkdir -p e2e/data
chmod -R 777 e2e/data

# 3. Start the container with a writable volume mounted to /opt/data
docker run -d \
  --name maintainerr-e2e-test \
  -p 6246:6246 \
  -v $(pwd)/e2e/data:/opt/data \
  -e NODE_ENV=production \
  maintainerr-e2e:test

# 4. Wait for the container to be ready
timeout 120 sh -c 'until curl -f http://localhost:6246/api/app/health > /dev/null 2>&1; do sleep 2; done'

# 5. Run the tests
yarn test:e2e

# 6. Clean up
docker stop maintainerr-e2e-test
docker rm maintainerr-e2e-test
```

**Important**: The Docker container requires a writable volume mounted to `/opt/data`. The container runs as the `node` user, so ensure the directory has proper write permissions (e.g., `chmod -R 777 e2e/data`).

## CI/CD Integration

The E2E tests run automatically in GitHub Actions for pull requests targeting the main branch. The workflow (`e2e.yml`) runs tests on both AMD64 and ARM64 platforms to ensure compatibility across architectures.

### Workflow Features

- **Multi-architecture testing**: Tests run on both `ubuntu-latest` (AMD64) and `ubuntu-24.04-arm` (ARM64)
- **Docker caching**: Uses GitHub Actions cache to speed up builds
- **Artifact uploads**: Test reports are uploaded for debugging failures
- **Container logs**: Automatically shown on test failure

## Test Structure

Tests are located in `e2e/tests/` and follow the pattern `*.spec.ts`.

### Current Tests

- **docker-startup.spec.ts**: Basic container startup and homepage accessibility tests

### Adding New Tests

To add new E2E tests:

1. Create a new test file in `e2e/tests/`:
   ```typescript
   import { test, expect } from '@playwright/test';
   
   test.describe('My Feature', () => {
     test('should do something', async ({ page }) => {
       await page.goto('/my-feature');
       // Your test code here
     });
   });
   ```

2. Run the tests to verify they work:
   ```bash
   yarn test:e2e
   ```

## Configuration

Playwright configuration is in `playwright.config.ts` at the project root. Key settings:

- **Base URL**: `http://localhost:6246` (can be overridden with `BASE_URL` env var)
- **Timeout**: 60 seconds per test
- **Retries**: 2 retries in CI, 0 locally
- **Browser**: Chromium only (for faster CI runs)

## Troubleshooting

### Container won't start

The most common issue is insufficient permissions on the data directory. The container runs as the `node` user and requires write access to `/opt/data`.

```bash
# Check container logs
docker logs maintainerr-e2e-test

# Verify data directory permissions
ls -la e2e/data

# Fix permissions if needed
chmod -R 777 e2e/data

# Ensure the volume is mounted correctly
docker inspect maintainerr-e2e-test | grep -A 10 Mounts
```

**Common error**: "Could not create or access (files in) the data directory"
- **Solution**: Ensure the `e2e/data` directory exists and has write permissions: `chmod -R 777 e2e/data`

### Tests timeout

- Increase the timeout in `playwright.config.ts`
- Check if the container is actually healthy: `curl http://localhost:6246/api/app/health`

### Port already in use

```bash
# Find what's using port 6246
lsof -i :6246

# Stop any existing Maintainerr containers
docker stop maintainerr-e2e-test
```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Maintainerr Repository](https://github.com/Maintainerr/Maintainerr)
