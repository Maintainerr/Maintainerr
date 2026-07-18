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

# Run node directly. `npm run start` only wraps `node dist/main` and leaks
# npm's update-notifier banner into the logs; cd preserves npm's --prefix cwd.
cd /opt/app/apps/server || exit 1

# `npm run` used to export npm_package_version, which the app reads to report its
# version. Launching node directly drops it, so populate it from package.json to
# keep the reported version accurate (otherwise it falls back to 0.0.1).
npm_package_version="$(node -p "require('./package.json').version" 2>/dev/null)"
export npm_package_version

exec node dist/main
