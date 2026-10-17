# 运行与部署

## 本地开发

需要 Node.js 22+。

```sh
npm ci
npm start
```

访问 http://localhost:3000。双人测试使用两个独立浏览器配置或两部手机，避免共用浏览器内的座位凭证。真人固定对坐，空位由电脑补齐。

## macOS 临时联机

使用 Cloudflare Quick Tunnel 为本地服务提供 HTTPS 地址，不需要云服务器、域名或 Cloudflare 账号。

```sh
brew install cloudflared
npm ci
npm run share:start
npm run share:status
```

启动前先停止单独运行的 `npm start`，释放 3000 端口。`share:status` 显示当前公网地址；两位玩家打开同一地址，一人开桌，另一人输入房间号，入座后再开始。

检查公网连接：

```sh
npm run share:check
```

检查会创建一个测试房间，验证两个客户端入座后断开，不操作现有牌局。

停止共享：

```sh
npm run share:stop
```

### 后台运行

`share:start` 在当前 macOS 登录会话中注册 launchd 任务，管理三个进程：

- 游戏服务器：仅监听 `127.0.0.1:3000`。
- `cloudflared`：通过 HTTP/2 连接 Cloudflare，并将请求转发给游戏服务器。
- `caffeinate`：共享期间阻止系统因空闲而休眠，停止共享后释放。

子进程退出后等待 5 秒重启；游戏健康检查每 10 秒执行一次，连续失败三次后重启游戏进程。launchd 负责重启退出的管理进程。游戏进程单独重启不会主动重建隧道。

配置、当前地址和日志位于 `.data/share/`，不纳入 Git。`service.log` 达到 2 MB 时轮换，保留一个历史文件。任务不安装为开机自启；注销或重启电脑后需要重新执行 `share:start`。移动仓库或更换 Node 安装位置前应先停止共享，再重新启动。

### 使用限制

- 电脑需要保持联网，建议接电并保持屏幕盖打开。防空闲休眠不能阻止合盖休眠、手动睡眠、断电或系统重启。
- 临时隧道没有可用性保证。进程重建会生成新地址，需重新分享。普通网络中断由 `cloudflared` 自动重连，不能保证每次都恢复原连接。
- 浏览器的座位凭证按网址保存。新域名无法读取旧域名的凭证；地址变化后建议重新开桌。服务器上的旧牌局文件仍保留。
- 拿到链接的人可以访问游戏。只向家人分享；停止共享即关闭公网入口。
- 国内与加拿大网络的实际延迟和可达性需要分别测试。

官方说明：[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。固定地址需要改用命名隧道或独立服务器。

## Docker

```sh
docker compose up -d --build game
```

默认仅暴露本机的 `127.0.0.1:3000`。运行数据保存在 `game-data` 卷。

## 独立服务器与 HTTPS

适用于有公网 IPv4、域名和 Docker Compose 的 Linux 服务器。

1. 将域名 A 记录指向服务器 IPv4。
2. 开放 TCP 80、443；SSH 仅允许管理地址。不需要开放 3000。
3. 获取仓库代码，从 `.env.example` 创建 `.env`，填写真实 `DOMAIN`。
4. 启动服务：

```sh
docker compose --profile public up -d --build
docker compose ps
docker compose logs --tail=100 game caddy
```

Caddy 自动申请与续期证书，并代理 WebSocket。域名解析及 80/443 端口必须可达。通过 `https://域名/health` 检查服务。

## 数据与更新

- 服务为单实例架构，房间保存在内存中，每次操作后原子写入磁盘。
- `.data` 或 `game-data` 卷包含手牌、积分和座位凭证，不应公开或提交 Git。
- 重启时恢复最近七天内有活动的房间；旧文件暂不自动删除。
- 断线保留座位，轮到离线玩家时等待。主动开启托管后才由电脑代打。
- 清除站点数据会丢失座位凭证，目前没有账号找回功能。
- 更新前备份数据。`docker compose down` 保留卷，`down -v` 会删除卷。

手机端可用 Safari 的“添加到主屏幕”保存入口。游戏需要联网；语音默认开启，首次点击页面时激活；若浏览器中断语音，可关闭再开启语音。
