#!/bin/sh

BASE_PATH_REPLACE="${BASE_PATH:-}"
UI_DIST_DIR="/opt/app/apps/server/dist/ui"

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