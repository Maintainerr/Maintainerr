#!/bin/sh

BASE_PATH_REPLACE="${BASE_PATH:-}"
UI_DIST_DIR="/opt/app/server/dist/ui"

# If ENABLE_DYNAMIC_BASE_PATH is set to 'true', skip the file rewriting step
# and let the NestJS middleware handle the replacement at runtime.
# This allows the container to run with read-only filesystems.
if [ "$ENABLE_DYNAMIC_BASE_PATH" = "true" ]; then
	printf 'Dynamic base path replacement is enabled. Skipping file rewriting.\n'
else
	# Replace the path prefix placeholder inside the built UI files; this can fail when
	# the directory is mounted as read-only, so surface a clearer error in that case.
	if ! find "$UI_DIST_DIR" -type f -not -path '*/node_modules/*' -print0 | xargs -0 sed -i "s,/__PATH_PREFIX__,$BASE_PATH_REPLACE,g"; then
		printf 'Failed to rewrite UI base paths under %s.\n' "$UI_DIST_DIR" >&2
		if [ ! -w "$UI_DIST_DIR" ]; then
			printf 'Read-only filesystem detected. Set ENABLE_DYNAMIC_BASE_PATH=true to enable runtime base path replacement.\n' >&2
		fi
		printf 'Please run the container with a writable filesystem or enable ENABLE_DYNAMIC_BASE_PATH and try again.\n' >&2
		exit 1
	fi
fi

exec npm run --prefix /opt/app/server start