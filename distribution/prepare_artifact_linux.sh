#!/bin/bash

SHA=$1

if [[ ! $SHA =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "Error: Invalid SHA"
    exit 1
fi

mkdir _output
mkdir _artifacts

cp -r node_modules _output/node_modules

# Frontend
mkdir -p _output/ui
mkdir -p _output/ui/.next/static
cp -r ui/.next/standalone/ui/. _output/ui
cp -r ui/.next/static/. _output/ui/.next/static
cp -r ui/public/. _output/ui/public
cp ui/.env.distribution _output/ui/.env
cp ui/.env _output/ui/.env.production

# Backend
mkdir -p _output/server/dist
cp -r server/dist/. _output/server/dist
cp server/package.json _output/server/package.json
cp server/.env.distribution _output/server/.env
cp server/.env _output/server/.env.production
cp -r server/node_modules/. _output/server/node_modules

# Packages
mkdir -p _output/packages/contracts/dist/node_modules
cp -r packages/contracts/dist/. _output/packages/contracts/dist
cp packages/contracts/package.json _output/packages/contracts/package.json
cp -r packages/contracts/node_modules/. _output/packages/contracts/node_modules

cp -rT distribution/linux _output
sed -i "s/%GIT_SHA%/$SHA/g" _output/server/.env.production