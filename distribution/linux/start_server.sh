#!/bin/bash

echo "Starting Maintainerr server..."

EXPORT NODE_ENV=production

exec npm run --prefix ./server start