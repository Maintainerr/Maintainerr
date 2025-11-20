# Development Quick Start Guide

This guide provides quick commands for common development tasks in Maintainerr.

## Table of Contents
- [Getting Started](#getting-started)
- [Running the Application](#running-the-application)
- [Building](#building)
- [Testing](#testing)
- [Linting & Formatting](#linting--formatting)
- [Database](#database)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Using Dev Container (Recommended)
1. Open in VS Code
2. Click "Reopen in Container" or press F1 → "Dev Containers: Reopen in Container"
3. Wait for setup to complete
4. Run `yarn dev` to start

### Manual Setup
1. Install Node.js 20.19.0+ or 22.12.0+
2. Enable corepack: `corepack enable && corepack install`
3. Install dependencies: `yarn install`
4. Create data directory: `mkdir -p data && chmod 777 data`
5. Build contracts: `yarn workspace @maintainerr/contracts build`
6. Run `yarn dev` to start

## Running the Application

### All Services (Recommended)
```bash
yarn dev
```
This starts both the server and UI in watch mode.
- Server: http://localhost:6246
- UI dev server proxies API requests to the server

### Individual Services
```bash
# Backend only (NestJS)
yarn workspace @maintainerr/server dev

# Frontend only (Next.js)
yarn workspace @maintainerr/ui dev
```

### VS Code Tasks
Use VS Code's Command Palette (F1) → "Tasks: Run Task" to access:
- **Start Development (Full Stack)** - Recommended for most development
- **Start Server (Backend Only)**
- **Start UI (Frontend Only)**

## Building

### Build Everything
```bash
yarn build
```

### Build Individual Packages
```bash
# Backend
yarn workspace @maintainerr/server build

# Frontend
yarn workspace @maintainerr/ui build

# Shared contracts
yarn workspace @maintainerr/contracts build
```

## Testing

### Run All Tests
```bash
yarn test
```

### Run Specific Tests
```bash
# Server tests only
yarn workspace @maintainerr/server test

# Watch mode (auto-rerun on changes)
yarn test:watch
yarn workspace @maintainerr/server test:watch

# With coverage
yarn workspace @maintainerr/server test:cov
```

### VS Code Testing
- Use the Testing panel in VS Code (beaker icon)
- Or use VS Code task: "Run All Tests"
- Debug tests with F5 → "Debug Server Tests"

## Linting & Formatting

### Lint All Code
```bash
yarn lint
```

### Format All Code
```bash
# Fix formatting
yarn format

# Check formatting without fixing
yarn format:check
```

### Type Checking
```bash
yarn check-types
```

### Auto-fix in VS Code
- Save any file - ESLint and Prettier run automatically
- Or: Command Palette → "Format Document"

## Database

### Location
- Development: `./data/maintainerr.sqlite`
- Production: `/opt/data/maintainerr.sqlite`

### Inspecting the Database

#### VS Code SQLTools (Recommended)
1. Open SQLTools panel (database icon in sidebar)
2. Connect to "Dev SQLite Database"
3. Browse tables and run queries

#### Command Line
```bash
# Install sqlite3 if needed
apt-get install sqlite3

# Open database
sqlite3 data/maintainerr.sqlite

# Common queries
.tables                    # List all tables
.schema table_name        # Show table structure
SELECT * FROM users;      # Example query
```

### Migrations

```bash
# Run pending migrations
yarn workspace @maintainerr/server migration:run

# Revert last migration
yarn workspace @maintainerr/server migration:revert

# Generate new migration
yarn workspace @maintainerr/server migration:generate -n MigrationName

# Show migration status
yarn workspace @maintainerr/server migration:show
```

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process on port 6246
lsof -ti:6246 | xargs kill -9

# Or change port in environment
export UI_PORT=6247
```

### Dependencies Issues
```bash
# Clean install
rm -rf node_modules server/node_modules ui/node_modules packages/*/node_modules
yarn install

# Or use VS Code task: "Clean Install"
```

### Build Artifacts Issues
```bash
# Clean all build outputs
rm -rf server/dist ui/.next ui/out packages/*/dist

# Or use VS Code task: "Clean Build Artifacts"
```

### Database Issues
```bash
# Reset database (WARNING: Deletes all data)
rm -rf data/maintainerr.sqlite

# Restart app to recreate
yarn dev
```

### Corepack/Yarn Issues
```bash
# Reinstall correct Yarn version
corepack disable
corepack enable
corepack install

# Verify
yarn --version  # Should show 4.11.0
```

### Dev Container Issues
```bash
# Rebuild container
# F1 → "Dev Containers: Rebuild Container"

# Or rebuild without cache
# F1 → "Dev Containers: Rebuild Container Without Cache"
```

## Environment Variables

See `.env.example` for all available environment variables and their descriptions.

Default values for development:
- `NODE_ENV=development`
- `UI_PORT=6246`
- `UI_HOSTNAME=0.0.0.0`
- `DATA_DIR=./data`

## Additional Resources

- [Main README](../README.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Dev Container README](../.devcontainer/README.md)
- [Official Documentation](https://docs.maintainerr.info)
- [Discord Community](https://discord.gg/WP4ZW2QYwk)
