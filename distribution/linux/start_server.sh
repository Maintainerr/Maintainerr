#!/bin/bash

echo "Starting Maintainerr server..."

NODE_ENV=production

exec npm run --prefix ./server start