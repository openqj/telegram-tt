FROM node:26-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

ARG WEB_A_BASE_URL
ARG WEB_A_MTPROTO_WS_URL
ARG WEB_A_PASEO_RELAY_WS_URL
ARG APP_ENV=staging
ENV APP_ENV=${APP_ENV} \
    BASE_URL=${WEB_A_BASE_URL} \
    TG_LOCAL_MTPROTO_WS_URL=${WEB_A_MTPROTO_WS_URL} \
    TG_PASEO_RELAY_WS_URL=${WEB_A_PASEO_RELAY_WS_URL}

RUN npm run build:gramsrv

FROM caddy:2-alpine

COPY --from=build /app/dist /srv
COPY deploy/gramsrv-web-a/Caddyfile /etc/caddy/Caddyfile
