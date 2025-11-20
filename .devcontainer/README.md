# Dev Container for Maintainerr

This directory contains the development container configuration for Maintainerr, enabling a consistent, zero-setup development environment using VS Code Dev Containers or GitHub Codespaces.

## What's Included

### Base Environment
- **Node.js 22.x** (Debian Bookworm base)
- **Yarn 4.11.0** (via corepack)
- **Build tools** (Python, Make, G++) for native modules
- **Git** with full functionality

### VS Code Extensions
The dev container automatically installs these extensions:
- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Tailwind CSS IntelliSense** - TailwindCSS autocomplete and syntax highlighting
- **Jest** - Test runner integration
- **SQLTools** - SQLite database inspection
- **TypeScript** - Enhanced TypeScript support
- **Docker** - Docker file support
- **YAML** - YAML file support (for GitHub Actions)
- **GitLens** - Enhanced Git capabilities
- **GitHub Copilot** - AI pair programming (if you have access)

### Configured Settings
- Format on save enabled
- ESLint auto-fix on save
- Organized imports on save
- TypeScript strict mode
- Prettier as default formatter
- SQLite database connection pre-configured

## Quick Start

### Using VS Code Dev Containers

1. **Prerequisites**:
   - Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
   - Install [Visual Studio Code](https://code.visualstudio.com/)
   - Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

2. **Open in Dev Container**:
   ```bash
   # Clone the repository
   git clone https://github.com/Maintainerr/Maintainerr.git
   cd Maintainerr
   
   # Open in VS Code
   code .
   ```

3. **Launch Container**:
   - VS Code will detect the `.devcontainer` folder
   - Click "Reopen in Container" when prompted
   - Or: Press `F1` → "Dev Containers: Reopen in Container"

4. **Wait for Setup**:
   - First-time setup takes 5-10 minutes
   - Dependencies are installed automatically
   - The `data/` directory is created with proper permissions

### Using GitHub Codespaces

1. Navigate to the [Maintainerr repository](https://github.com/Maintainerr/Maintainerr)
2. Click the **Code** button → **Codespaces** tab
3. Click **Create codespace on main** (or your branch)
4. Wait for the environment to build (5-10 minutes first time)
5. Start developing!

## Development Workflow

### Running the Application

Start the entire application (server + UI):
```bash
yarn dev
```

The application will be available at:
- **Main app**: http://localhost:6246

### Running Individual Services

Start only the server:
```bash
yarn workspace @maintainerr/server dev
```

Start only the UI:
```bash
yarn workspace @maintainerr/ui dev
```

### Building

Build all packages:
```bash
yarn build
```

Build a specific workspace:
```bash
yarn workspace @maintainerr/server build
yarn workspace @maintainerr/ui build
yarn workspace @maintainerr/contracts build
```

### Testing

Run all tests:
```bash
yarn test
```

Run tests in watch mode:
```bash
yarn test:watch
```

Run server tests only:
```bash
yarn workspace @maintainerr/server test
```

### Linting and Formatting

Run linters:
```bash
yarn lint
```

Format code:
```bash
yarn format
```

Check formatting without changing files:
```bash
yarn format:check
```

### Type Checking

Check TypeScript types:
```bash
yarn check-types
```

## Database Access

The dev container includes SQLTools with a pre-configured connection to the SQLite database:

1. Open the SQLTools panel in VS Code (database icon in sidebar)
2. Connect to "Dev SQLite Database"
3. Browse tables, run queries, and inspect data

Database location: `./data/maintainerr.sqlite`

## Debugging

The dev container is configured for debugging:

1. Set breakpoints in your code
2. Use VS Code's built-in debugger
3. For server debugging:
   ```bash
   yarn workspace @maintainerr/server test:debug
   ```

## Customization

### Changing Node Version

Edit `.devcontainer/devcontainer.json`:
```json
"args": {
  "NODE_VERSION": "20"  // or "22"
}
```

### Adding Extensions

Edit the `extensions` array in `.devcontainer/devcontainer.json`.

### Modifying Settings

Edit the `settings` object in `.devcontainer/devcontainer.json`.

## Troubleshooting

### Container Won't Start

1. Ensure Docker is running
2. Try rebuilding: `F1` → "Dev Containers: Rebuild Container"
3. Check Docker Desktop for errors

### Dependencies Not Installing

1. Rebuild the container
2. Manually run: `yarn install`
3. Check that corepack is enabled: `corepack enable`

### Port Already in Use

1. Stop other services using port 6246
2. Or modify the port in `.devcontainer/devcontainer.json`

### Permission Errors

The container runs as user `node` (UID 1000). If you encounter permission issues:
1. The `data/` directory should be writable
2. Check file permissions: `ls -la data/`
3. Fix if needed: `chmod -R 777 data/`

### Database Issues

If the database file is corrupted or you want to start fresh:
```bash
rm -rf data/maintainerr.sqlite
# Restart the application to recreate
```

## Architecture Details

### Why Single Container?

Maintainerr uses SQLite (file-based database), so no separate database container is needed. This keeps the dev environment simple and fast to start.

### Volume Mounts

- **Workspace**: `/workspace` (your code)
- **Data directory**: `/workspace/data` (SQLite database and logs)
- **Node modules**: Installed in container (faster than host mounts)

### Build Process

The Dockerfile:
1. Starts from official Node.js 22 image
2. Installs build tools for native modules
3. Enables corepack for Yarn 4.x
4. Creates data directory with permissions
5. Sets up non-root user (node)

The post-create script:
1. Enables corepack
2. Installs all dependencies
3. Creates data directory
4. Builds the contracts package
5. Displays helpful information

## Resources

- [VS Code Dev Containers Documentation](https://code.visualstudio.com/docs/devcontainers/containers)
- [GitHub Codespaces Documentation](https://docs.github.com/en/codespaces)
- [Maintainerr Documentation](https://docs.maintainerr.info)
- [Contributing Guide](../CONTRIBUTING.md)

## Support

If you encounter issues with the dev container:
1. Check this README's troubleshooting section
2. Open an issue on [GitHub](https://github.com/Maintainerr/Maintainerr/issues)
3. Ask in our [Discord server](https://discord.gg/WP4ZW2QYwk)
