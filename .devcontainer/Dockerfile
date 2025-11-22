# Use the official Node.js image as base
# Matches production Node version (Node 24)
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm

# Install additional OS packages needed for development
# - python3, make, g++: Required for building native node modules (like sqlite3)
# - curl, wget: Useful for downloading files
# - git: Already in base image but ensuring latest version
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    build-essential \
    curl \
    wget \
    git \
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack for Yarn 4.x support
RUN corepack enable && corepack prepare yarn@4.11.0 --activate

# Use the non-root node user that exists in the base image
ARG USERNAME=node

# Create data directory with proper permissions for development
# This matches the production requirement for /opt/data
RUN mkdir -p /workspace/data \
    && chown -R ${USERNAME}:${USERNAME} /workspace/data \
    && chmod -R 777 /workspace/data

# Set the default working directory
WORKDIR /workspace

# Switch to non-root user
USER ${USERNAME}

# Install global tools that might be useful for development
# Turbo is already installed as a dev dependency, but global install can be helpful
RUN yarn global add turbo@^2

# Set environment variables for development
ENV NODE_ENV=development
ENV SHELL=/bin/bash

# The container will stay running with the default command
# The actual application will be started via VS Code tasks or manually
CMD ["sleep", "infinity"]
