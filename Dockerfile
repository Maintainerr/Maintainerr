FROM node:24.11.1-alpine3.22@sha256:2867d550cf9d8bb50059a0fff528741f11a84d985c732e60e19e8e75c7239c43 AS base
LABEL Description="Contains the Maintainerr Docker image"

FROM base AS builder

WORKDIR /app

RUN yarn global add turbo@^2
COPY . .

RUN yarn install --network-timeout 99999999
RUN yarn cache clean

RUN <<EOF cat >> ./ui/.env
NEXT_PUBLIC_BASE_PATH=/__PATH_PREFIX__
EOF

RUN sed -i "s,basePath: '',basePath: '/__PATH_PREFIX__',g" ./ui/next.config.js

RUN yarn turbo build

# Only install production dependencies to reduce image size
RUN yarn workspaces focus --all --production

# When all packages are hoisted, there is no node_modules folder. Ensure these folders always have a node_modules folder to COPY later on.
RUN mkdir -p ./packages/contracts/node_modules
RUN mkdir -p ./server/node_modules
RUN mkdir -p ./ui/node_modules

FROM base AS runner

WORKDIR /opt/app

# copy root node_modules
COPY --from=builder --chmod=777 --chown=node:node /app/node_modules ./node_modules

# copy standalone UI
COPY --from=builder --chmod=777 --chown=node:node /app/ui/.next/standalone/ui ./ui
COPY --from=builder --chmod=777 --chown=node:node /app/ui/.next/static ./ui/.next/static
COPY --from=builder --chmod=777 --chown=node:node /app/ui/public ./ui/public

# Copy standalone server
COPY --from=builder --chmod=777 --chown=node:node /app/server/dist ./server/dist
COPY --from=builder --chmod=777 --chown=node:node /app/server/package.json ./server/package.json
COPY --from=builder --chmod=777 --chown=node:node /app/server/node_modules ./server/node_modules

# Copy packages/contracts
COPY --from=builder --chmod=777 --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chmod=777 --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder --chmod=777 --chown=node:node /app/packages/contracts/node_modules ./packages/contracts/node_modules

COPY docker/supervisord.conf /etc/supervisord.conf
COPY --chmod=777 --chown=node:node docker/start.sh /opt/app/start.sh

# Create required directories
RUN mkdir -m 777 /opt/data && \
    mkdir -m 777 /opt/data/logs && \
    chown -R node:node /opt/data

# This is required for docker user directive to work
RUN chmod 777 /opt/app/start.sh && \
    chmod 777 /opt/app/ui && \
    chmod 777 /opt/app/ui/public && \
    chmod 777 /opt/app/ui/.next/static && \
    mkdir -m 777 /opt/app/ui/.next/cache && \
    chown -R node:node /opt/app/ui/.next/cache

RUN apk --update --no-cache add curl supervisor

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

ARG DEBUG=false
ENV DEBUG=${DEBUG}

ARG API_PORT=3001
ENV API_PORT=${API_PORT}

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

VOLUME [ "/opt/data" ]
ENTRYPOINT ["/opt/app/start.sh"]
