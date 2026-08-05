#!/bin/sh

BASE_PATH_REPLACE="${BASE_PATH:-}"
BUNDLED_UI_DIR="/opt/app/apps/server/dist/ui"
SERVED_UI_DIR="${DATA_DIR:-/opt/data}/ui"

# The UI bundle carries a /__PATH_PREFIX__ placeholder that only resolves once
# BASE_PATH is known, which is at boot. Rewriting it inside the image would mean
# shipping the app tree world-writable, since the container runs as whichever uid
# the `user` directive picks. Instead the bundle is copied into the data
# directory - the one tree that uid is guaranteed to own - and rewritten there.
# Rebuilt from scratch every boot so an upgrade or a changed BASE_PATH can never
# leave a stale chunk behind.
#
# cp reproduces the source mode and the bundle ships read-only, so both the copy
# and the previous boot's copy come out unwritable. rm needs write on a directory
# to unlink what is inside it, so restore that before clearing and again after
# copying. The staging user owns these paths, so chmod works whichever uid it is.
if [ -d "$SERVED_UI_DIR" ]; then
	chmod -R u+w "$SERVED_UI_DIR" 2>/dev/null
fi
rm -rf "$SERVED_UI_DIR"

if ! mkdir -p "$SERVED_UI_DIR" ||
	! cp -R "$BUNDLED_UI_DIR/." "$SERVED_UI_DIR/" ||
	! chmod -R u+w "$SERVED_UI_DIR"; then
	printf 'Failed to stage the UI into %s.\n' "$SERVED_UI_DIR" >&2
	printf 'The data directory must be writable by the user the container runs as.\n' >&2
	exit 1
fi

if ! find "$SERVED_UI_DIR" -type f -print0 | xargs -0 sed -i "s,/__PATH_PREFIX__,$BASE_PATH_REPLACE,g"; then
	printf 'Failed to rewrite UI base paths under %s.\n' "$SERVED_UI_DIR" >&2
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
