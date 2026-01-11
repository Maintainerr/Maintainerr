#!/bin/sh

BASE_PATH_REPLACE="${BASE_PATH:-}"
UI_DIST_DIR="/opt/app/apps/server/dist/ui"
DATA_DIR="/opt/data"

# Check if the data directory is properly mounted to persistent storage
# This can be skipped by setting SKIP_DATA_MOUNT_CHECK=true
if [ "${SKIP_DATA_MOUNT_CHECK}" != "true" ]; then
	# Use mountpoint command to check if /opt/data is actually a mount point
	# mountpoint is part of BusyBox (included in Alpine Linux by default)
	# Returns 0 if it IS a mount point, 1 if it is NOT
	if ! mountpoint -q "${DATA_DIR}"; then
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