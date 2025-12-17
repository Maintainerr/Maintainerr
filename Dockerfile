FROM node:24.12.0-alpine3.22@sha256:4f4a059445c5a6ef2b9d169d9afde176301263178141fc05ba657dab1c84f9a7 AS base
LABEL Description="Contains the Maintainerr Docker image"

FROM base AS builder

WORKDIR /app

RUN yarn global add turbo@^2

# Copy only files needed to resolve/install dependencies first (better Docker layer caching)
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY .yarn/releases ./.yarn/releases
COPY apps/server/package.json ./apps/server/package.json
COPY apps/ui/package.json ./apps/ui/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN yarn install --network-timeout 99999999

# Copy the rest of the repository after deps are installed
COPY . .

RUN <<EOF cat >> ./apps/ui/.env
VITE_BASE_PATH=/__PATH_PREFIX__
EOF

RUN yarn turbo build

# Only install production dependencies to reduce image size
RUN yarn workspaces focus --all --production

# When all packages are hoisted, there is no node_modules folder. Ensure these folders always have a node_modules folder to COPY later on.
RUN mkdir -p ./packages/contracts/node_modules
RUN mkdir -p ./apps/server/node_modules

FROM base AS runner

WORKDIR /opt/app

# copy root node_modules
COPY --from=builder --chmod=777 --chown=node:node /app/node_modules ./node_modules

# Copy standalone server
COPY --from=builder --chmod=777 --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=builder --chmod=777 --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder --chmod=777 --chown=node:node /app/apps/server/node_modules ./apps/server/node_modules

# copy UI output to API to be served statically
COPY --from=builder --chmod=777 --chown=node:node /app/apps/ui/dist ./apps/server/dist/ui

# Copy packages/contracts
COPY --from=builder --chmod=777 --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chmod=777 --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder --chmod=777 --chown=node:node /app/packages/contracts/node_modules ./packages/contracts/node_modules

COPY --chmod=777 --chown=node:node docker/start.sh /opt/app/start.sh

# Create required directories
RUN mkdir -m 777 /opt/data && \
    mkdir -m 777 /opt/data/logs && \
    chown -R node:node /opt/data

# This is required for docker user directive to work
RUN chmod 777 /opt/app/start.sh

RUN apk --update --no-cache add curl

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

ARG DEBUG=false
ENV DEBUG=${DEBUG}

ARG UI_PORT=6246
ENV UI_PORT=${UI_PORT}

ARG UI_HOSTNAME=0.0.0.0
ENV UI_HOSTNAME=${UI_HOSTNAME}

# Hash of the last GIT commit
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

ENV DATA_DIR=/opt/data

# container version type. develop, stable, edge,.. a release=stable
ARG VERSION_TAG=develop
ENV VERSION_TAG=$VERSION_TAG

ARG BASE_PATH
ENV BASE_PATH=${BASE_PATH}

# Temporary workaround for https://github.com/libuv/libuv/pull/4141
ENV UV_USE_IO_URING=0

USER node

EXPOSE 6246

# IMPORTANT: VOLUME directive removed to enable mount detection
# Users MUST explicitly configure a volume for /opt/data:
#   docker run: -v ./data:/opt/data
#   docker-compose: volumes: - ./data:/opt/data
# See README.md for complete examples
ENTRYPOINT ["/opt/app/start.sh"]
