#!/bin/sh

BASE_PATH_REPLACE="${BASE_PATH:-}"

find /opt/app/server/dist/ui -type f -not -path '*/node_modules/*' -print0 | xargs -0 sed -i "s,/__PATH_PREFIX__,$BASE_PATH_REPLACE,g"

exec npm run --prefix /opt/app/server start