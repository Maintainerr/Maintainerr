FROM node:20-alpine3.19 AS builder
LABEL Description="Contains the Maintainerr Docker image"

WORKDIR /opt/app/

ARG TARGETPLATFORM
ENV TARGETPLATFORM=${TARGETPLATFORM:-linux/amd64}

COPY server/ ./server/
COPY ui/ ./ui/
COPY package.json ./package.json
COPY yarn.lock ./yarn.lock
COPY .yarnrc.yml ./.yarnrc.yml

# Enable correct yarn version
RUN corepack install && \
    corepack enable

RUN apk --update --no-cache add python3 make g++ curl

RUN yarn --immutable --network-timeout 99999999

RUN \
    case "${TARGETPLATFORM}" in ('linux/arm64' | 'linux/amd64') \
    yarn add sharp \
    ;; \
    esac

RUN yarn build:server


RUN <<EOF cat >> ./ui/.env
NEXT_PUBLIC_BASE_PATH=/__PATH_PREFIX__
EOF

RUN sed -i "s,basePath: '',basePath: '/__PATH_PREFIX__',g" ./ui/next.config.js

RUN yarn build:ui

# copy standalone UI 
RUN mv ./ui/.next/standalone/ui/ ./standalone-ui/ && \
    mv ./ui/.next/standalone/ ./standalone-ui/ && \
    mv ./ui/.next/static ./standalone-ui/.next/static && \
    mv ./ui/public ./standalone-ui/public && \
    rm -rf ./ui && \
    mv ./standalone-ui ./ui

# Copy standalone server
RUN mv ./server/dist ./standalone-server && \
    rm -rf ./server && \
    mv ./standalone-server ./server

RUN rm -rf node_modules .yarn 

RUN yarn workspaces focus --production

RUN rm -rf .yarn && \
    rm -rf /opt/yarn-* && \
    chown -R node:node /opt/ && \
    chmod -R 755 /opt/ && \
    # Data dir
    mkdir -m 777 /opt/data && \
    mkdir -m 777 /opt/data/logs && \
    chown -R node:node /opt/data

# Final build
FROM node:20-alpine3.19

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

# container version type. develop, stable, edge,.. a release=stable
ARG VERSION_TAG=develop
ENV VERSION_TAG=$VERSION_TAG

ARG BASE_PATH
ENV BASE_PATH=${BASE_PATH}

# Set global yarn vars to a folder read/write able for all users
ENV YARN_INSTALL_STATE_PATH=/tmp/.yarn/install-state.gz
ENV YARN_GLOBAL_FOLDER=/tmp/.yarn/global
ENV YARN_CACHE_FOLDER=/tmp/.yarn/cache

# Temporary workaround for https://github.com/libuv/libuv/pull/4141
ENV UV_USE_IO_URING=0

COPY --from=builder --chown=node:node /opt /opt

WORKDIR /opt/app

COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/start.sh /opt/app/start.sh

# Enable correct yarn version, add supervisor & chown root /opt dir
RUN corepack install && \
    corepack enable && \
    apk add supervisor curl && \
    chown node:node /opt && \
    # This is required for docker user directive to work
    chmod 777 /opt && \
    chmod 777 /opt/app/start.sh && \
    mkdir -m 777 /.cache  && \
    mkdir -pm 777 /opt/app/ui/.next/cache && \
    chown -R node:node /opt/app/ui/.next/cache

USER node

# Picked up for Node's .cache directory.
ENV HOME=/

EXPOSE 6246

VOLUME [ "/opt/data" ]
ENTRYPOINT ["/opt/app/start.sh"]
