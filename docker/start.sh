#!/bin/sh

BASE_PATH_REPLACE="${BASE_PATH:-}"
UI_DIST_DIR="/opt/app/apps/server/dist/ui"
DATA_DIR="/opt/data"

# Check if the data directory is properly mounted to persistent storage
# This can be skipped by setting SKIP_DATA_MOUNT_CHECK=true
if [ "${SKIP_DATA_MOUNT_CHECK}" != "true" ]; then
	# Get the mount entry for /opt/data from /proc/mounts
	# Format: device mountpoint type options ...
	mount_entry=$(grep "^[^ ]* ${DATA_DIR} " /proc/mounts)
	
	if [ -z "$mount_entry" ]; then
		# No mount found at all (shouldn't happen due to VOLUME directive, but check anyway)
		printf '\n========================================\n' >&2
		printf 'ERROR: /opt/data is not mounted!\n' >&2
		printf '========================================\n\n' >&2
		printf 'The /opt/data directory must be mounted to persistent storage.\n' >&2
		printf 'Without a proper mount, all data (database, logs, etc.) will be lost\n' >&2
		printf 'when the container is removed or recreated.\n\n' >&2
		printf 'Please update your Docker configuration:\n\n' >&2
		printf 'Docker run:\n' >&2
		printf '  docker run -v ./data:/opt/data ...\n\n' >&2
		printf 'Docker Compose:\n' >&2
		printf '  volumes:\n' >&2
		printf '    - ./data:/opt/data\n\n' >&2
		printf 'To bypass this check (not recommended), set:\n' >&2
		printf '  SKIP_DATA_MOUNT_CHECK=true\n\n' >&2
		exit 1
	fi
	
	# Extract the source path (first field) from the mount entry
	mount_source=$(echo "$mount_entry" | awk '{print $1}')
	
	# Check if this is an anonymous Docker volume (64-character hex hash)
	# Anonymous volumes have paths like: /var/lib/docker/volumes/{64-hex-chars}/_data
	if echo "$mount_source" | grep -q '/var/lib/docker/volumes/[0-9a-f]\{64\}/_data'; then
		printf '\n========================================\n' >&2
		printf 'ERROR: /opt/data is using an anonymous Docker volume!\n' >&2
		printf '========================================\n\n' >&2
		printf 'Anonymous Docker volumes are not persistent and will be lost\n' >&2
		printf 'when the container is removed.\n\n' >&2
		printf 'This happened because the Dockerfile declares a VOLUME, but you\n' >&2
		printf 'did not explicitly map it to a persistent location.\n\n' >&2
		printf 'Please update your Docker configuration:\n\n' >&2
		printf 'Docker run:\n' >&2
		printf '  docker run -v ./data:/opt/data ...\n\n' >&2
		printf 'Docker Compose:\n' >&2
		printf '  volumes:\n' >&2
		printf '    - ./data:/opt/data\n\n' >&2
		printf 'To bypass this check (not recommended), set:\n' >&2
		printf '  SKIP_DATA_MOUNT_CHECK=true\n\n' >&2
		exit 1
	fi
fi

# Replace the path prefix placeholder inside the built UI files; this can fail when
# the directory is mounted as read-only, so surface a clearer error in that case.
if ! find "$UI_DIST_DIR" -type f -not -path '*/node_modules/*' -print0 | xargs -0 sed -i "s,/__PATH_PREFIX__,$BASE_PATH_REPLACE,g"; then
	printf 'Failed to rewrite UI base paths under %s.\n' "$UI_DIST_DIR" >&2
	if [ ! -w "$UI_DIST_DIR" ]; then
		printf 'Read-only filesystem detected. Mounting this directory as read-only is not supported.\n' >&2
	fi
	printf 'Please run the container with a writable filesystem and try again.\n' >&2
	exit 1
fi

exec npm run --prefix /opt/app/apps/server start