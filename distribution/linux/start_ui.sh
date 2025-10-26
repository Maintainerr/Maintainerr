#!/bin/bash

echo "Starting Maintainerr UI..."

export NODE_ENV=production

exec node --env-file=./ui/.env.production --env-file=./ui/.env ./ui/server.js