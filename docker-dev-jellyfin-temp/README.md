# Jellyfin + Maintainerr Docker Test Environment

This directory contains a complete Docker Compose setup for testing Maintainerr's Jellyfin integration. It can build Maintainerr from **any branch** and run it alongside a Jellyfin server.

## Quick Start

```bash
cd docker-dev-jellyfin-temp

# Start with default branch
docker compose up -d

# Or build from a specific branch
BRANCH=main docker compose up -d --build
BRANCH=jellyfin-phase-e docker compose up -d --build

# Build from a fork
REPO=https://github.com/yourfork/Maintainerr.git BRANCH=my-feature docker compose up -d --build
```

## Access Points

| Service     | URL                   | Description           |
| ----------- | --------------------- | --------------------- |
| Maintainerr | http://localhost:6246 | Maintainerr web UI    |
| Jellyfin    | http://localhost:8096 | Jellyfin media server |

## First-Time Setup

### 1. Initialize Sample Media (Optional)

```bash
docker compose run --rm media-generator
```

This creates placeholder movie and TV show files that Jellyfin can scan.

### 2. Configure Jellyfin

1. Open http://localhost:8096
2. Complete the setup wizard:
   - Select your language
   - Create an admin user (e.g., `admin` / `password`)
3. Add Media Libraries:
   - **Movies**: Content type "Movies", Folder `/media/movies`
   - **TV Shows**: Content type "Shows", Folder `/media/tvshows`
4. Get an API Key:
   - Dashboard → API Keys → Add (name it "Maintainerr")
   - **Copy the generated API key**

### 3. Configure Maintainerr

1. Open http://localhost:6246
2. Complete initial setup if prompted
3. Go to **Settings** → **Media Server**
4. Select **Jellyfin** as the media server type
5. Enter connection details:
   - **URL**: `http://jellyfin:8096` (internal Docker network)
   - **API Key**: (paste the key from step 2.4)
6. Click **Test Connection** then **Save**

## Testing Different Branches

### Build from a specific branch

```bash
# Rebuild with a different branch
BRANCH=develop docker compose up -d --build

# Force rebuild without cache
BRANCH=jellyfin-phase-e docker compose build --no-cache
docker compose up -d
```

### Build from a fork

```bash
REPO=https://github.com/enoch85/Maintainerr.git BRANCH=jellyfin-fixes docker compose up -d --build
```

### Compare branches

```bash
# Terminal 1: Run main branch on port 6246
BRANCH=main docker compose -p maintainerr-main up -d

# Terminal 2: Run feature branch on port 6247
# (modify docker-compose.yml ports first)
BRANCH=jellyfin-phase-e docker compose -p maintainerr-feature up -d
```

## Directory Structure

After running, the following directories are created:

```
docker/
├── docker-compose.yml      # Main compose configuration
├── Dockerfile.dev          # Builds Maintainerr from any branch
├── README.md               # This file
├── .gitignore              # Excludes data directories
├── maintainerr-data/       # Maintainerr persistent data (auto-created)
├── jellyfin-config/        # Jellyfin configuration (auto-created)
├── jellyfin-cache/         # Jellyfin cache (auto-created)
└── media/                  # Sample media library
    ├── movies/
    │   ├── The Matrix (1999)/
    │   ├── Inception (2010)/
    │   └── ...
    └── tvshows/
        ├── Breaking Bad/
        ├── The Office/
        └── ...
```

## Useful Commands

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f maintainerr
docker compose logs -f jellyfin
```

### Restart services

```bash
docker compose restart maintainerr
docker compose restart jellyfin
```

### Stop everything

```bash
docker compose down
```

### Clean slate (remove all data)

```bash
docker compose down -v
rm -rf maintainerr-data jellyfin-config jellyfin-cache media
```

### Check which branch is running

```bash
docker exec maintainerr-test printenv MAINTAINERR_BRANCH
```

## API Testing

### Jellyfin API

```bash
API_KEY="your-api-key"

# Server info
curl -H "X-MediaBrowser-Token: $API_KEY" http://localhost:8096/System/Info

# List all items
curl -H "X-MediaBrowser-Token: $API_KEY" http://localhost:8096/Items

# List users
curl -H "X-MediaBrowser-Token: $API_KEY" http://localhost:8096/Users

# Get libraries
curl -H "X-MediaBrowser-Token: $API_KEY" http://localhost:8096/Library/VirtualFolders
```

### Maintainerr API

```bash
# Health check
curl http://localhost:6246/api/app/status

# Get settings (requires auth after setup)
curl http://localhost:6246/api/settings
```

## Troubleshooting

### Build fails

```bash
# Check build logs
docker compose build --no-cache 2>&1 | tee build.log

# Verify branch exists
git ls-remote https://github.com/Maintainerr/Maintainerr.git | grep jellyfin
```

### Permission issues

```bash
# Check your user ID
id -u

# Update docker-compose.yml jellyfin user if needed (default is 1000:1000)
```

### Maintainerr can't connect to Jellyfin

1. Ensure you're using the internal Docker hostname: `http://jellyfin:8096`
2. Check Jellyfin is healthy: `docker compose ps`
3. Verify API key is correct in Jellyfin Dashboard → API Keys

### Container won't start

```bash
# Check container status
docker compose ps

# View detailed logs
docker compose logs maintainerr --tail 100

# Check port availability
lsof -i :6246
lsof -i :8096
```

### Reset Maintainerr database

```bash
# Stop Maintainerr
docker compose stop maintainerr

# Remove database (keeps settings)
rm -f maintainerr-data/maintainerr.db

# Restart
docker compose start maintainerr
```
