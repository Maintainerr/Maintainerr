#!/bin/bash
# Development environment setup script for Maintainerr
# This script sets up the development environment and keeps it running

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "🔧 Setting up Maintainerr development environment..."

# Check for node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please ensure Node.js is installed."
    echo "   If using nvm, run: nvm install && nvm use"
    exit 1
fi

echo "📍 Using Node.js $(node --version)"

# Setup corepack and yarn
if command -v corepack &> /dev/null; then
    echo "📦 Setting up corepack..."
    corepack install
    corepack enable
else
    echo "⚠️  Corepack not found, using existing yarn"
fi

# Install dependencies
echo "📥 Installing dependencies..."
yarn install

# Build contracts first (required by server and ui)
echo "🏗️  Building contracts..."
yarn workspace @maintainerr/contracts build

echo "✅ Setup complete! Starting development server..."

# Start development server
yarn dev
