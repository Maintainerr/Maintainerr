#!/bin/bash

echo "Starting Maintainerr server..."

export NODE_ENV=production

exec npm run --prefix ./server start