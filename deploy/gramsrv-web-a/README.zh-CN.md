# 自托管 Web A + Gramsrv

此部署包在自有 Linux 主机上构建并托管 Web A；Caddy 用同一个 HTTPS 域名服务静态客户端，并把 MTProto WebSocket、Gramsrv server-info 和 Agent Mini App 路径转发到同机 Gramsrv。它不使用 `web.telegram.org`。

## 前置条件

- 一台启用了 Docker Compose 的 Linux 主机。
- 一个指向该主机的 DNS 名称，公网 TCP 80/443 可达。
- 同机 Gramsrv 已启动，MTProto/WebSocket 监听 `127.0.0.1:2398`，public-link Web 监听 `127.0.0.1:2401`。

## 配置 Gramsrv

将下列值放进 Gramsrv 自己的 secret/config 管理，不要写进 Web A `.env`：

```dotenv
TELESRV_WEBSOCKET_ENABLE=true
TELESRV_WEBSOCKET_ALLOWED_ORIGINS=https://web-a.staging.example.com
TELESRV_PUBLIC_LINK_WEB_ADDR=127.0.0.1:2401
TELESRV_PUBLIC_WEB_BASE_URL=https://web-a.staging.example.com
TELESRV_MINIAPP_BOTFATHER_TOKEN=<server-side secret>
```

Gramsrv 的 Gateway 地址和签名凭证仍只在服务端配置。数据库、Redis、Gateway 和管理端口保持私网/回环监听。配置并运行 Gramsrv/Gateway 后，再启动本 Web A 服务。

## 启动 Web A

复制 `.env.example` 为 `.env`，将 `WEB_A_HOST`、`WEB_A_BASE_URL`、`WEB_A_MTPROTO_WS_URL` 和 `WEB_A_PASEO_RELAY_WS_URL` 替换成你自己的域名。MTProto WebSocket 使用同源 `wss://<host>/apiws`；Paseo Relay 使用 `wss://<relay-host>/ws`。CSP 仅放行这两个配置的 WebSocket 源。示例默认构建 `staging`；经过 staging 验收后，可把 `WEB_A_APP_ENV` 改成 `production` 再发布。

在仓库根目录运行：

```sh
docker compose --env-file deploy/gramsrv-web-a/.env -f deploy/gramsrv-web-a/compose.yaml up -d --build
```

Caddy 会自动申请并续期 HTTPS 证书。客户端入口为 `https://<host>/a/`；`/apiws*` 和 `/owpengram/*` 代理到 Gramsrv MTProto 端口，`/agents` 与 `/api/miniapps/agents*` 代理到 Gramsrv public-link Web 端口。

Gramsrv 发布 Agent Mini App URL 前，还需要按服务端配置文档提供有效的 `TELESRV_MINIAPP_BOTFATHER_TOKEN` 和 Agent Gateway 配置。真实用户登录前应将开发态验证码投递配置换成可用的生产验证码通道。

## 更新

更新 Web A 源码后重新执行上面的 Compose 命令。WebSocket 域名在构建时写入 CSP；改变域名时同时更新 `.env` 和 Gramsrv 的允许 Origin，再重新构建。
