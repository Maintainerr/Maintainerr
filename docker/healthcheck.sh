#!/bin/sh

# Docker HEALTHCHECK probe. Hits the readiness endpoint (which pings the
# database) on the locally listening server. BASE_PATH is normalised the same
# way the app's global prefix is (leading/trailing slashes stripped), so the
# probe keeps working when Maintainerr is served from a subfolder.

PORT="${UI_PORT:-6246}"

PREFIX="${BASE_PATH:-}"
while [ "${PREFIX#/}" != "$PREFIX" ]; do
	PREFIX="${PREFIX#/}"
done
while [ "${PREFIX%/}" != "$PREFIX" ]; do
	PREFIX="${PREFIX%/}"
done

if [ -n "$PREFIX" ]; then
	PATH_PREFIX="/$PREFIX"
else
	PATH_PREFIX=""
fi

exec curl -fsS "http://127.0.0.1:${PORT}${PATH_PREFIX}/api/health/ready"
