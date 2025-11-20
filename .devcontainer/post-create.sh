#!/bin/bash

# Post-create script for Maintainerr dev container
# This script runs after the container is created to set up the development environment

set -e

echo "🚀 Setting up Maintainerr development environment..."

# Ensure we're in the workspace directory
# This works both in dev containers (/workspace) and when run locally
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKSPACE_DIR="$( cd "${SCRIPT_DIR}/.." && pwd )"
cd "${WORKSPACE_DIR}"

echo "📂 Working directory: ${WORKSPACE_DIR}"

# Enable corepack and set correct Yarn version
echo "📦 Setting up Yarn..."
corepack enable
corepack install

# Install dependencies
echo "📥 Installing dependencies (this may take a few minutes)..."
yarn install

# Create data directory if it doesn't exist
echo "📁 Setting up data directory..."
mkdir -p data
chmod -R 777 data

# Build the contracts package (required dependency)
echo "🔧 Building shared contracts package..."
yarn workspace @maintainerr/contracts build

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "🎯 Available commands:"
echo "  yarn dev          - Start development servers (server + ui)"
echo "  yarn build        - Build all packages"
echo "  yarn test         - Run tests"
echo "  yarn lint         - Run linters"
echo "  yarn format       - Format code with Prettier"
echo ""
echo "📝 Workspace-specific commands:"
echo "  yarn workspace @maintainerr/server dev   - Start server only"
echo "  yarn workspace @maintainerr/ui dev       - Start UI only"
echo "  yarn workspace @maintainerr/server test  - Run server tests"
echo ""
echo "🌐 The application will be available at:"
echo "  http://localhost:6246"
echo ""
