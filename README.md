# anon-chat · 暗夜信号

多账号匿名聊天空间。邀请码注册、不支持超链接与分享、支持图片/语音/视频。
所有聊天记录（文本 + 媒体元数据）持久化到 **Turso (libSQL)**，媒体二进制存 **Vercel Blob**，实时消息走 **SSE**。

## 技术栈（为 Vercel 而生）
- **Next.js 15 (App Router) + React 19** — Vercel 一等公民
- **Turso (libSQL) + Drizzle ORM** — 边缘 SQLite
- **Vercel Blob** — 图片/语音/视频存储
- **SSE** — 实时消息回流（客户端自动重连）
- **jose** — 会话 JWT（httpOnly cookie）

## 功能
- 多账号匿名：注册生成随机匿名身份 + 本地 credential，同设备多账号一键切换
- 邀请码注册：`invite_codes` 一次性使用，运营用 `ADMIN_CODE` 调 `/api/codes` 生成
- 图片/语音/视频：语音/视频走浏览器内 `MediaRecorder` 录制，图片走文件选择
- 私密房间：邀请码准入，非成员读取返回 403
- 阅后即焚：消息可设 TTL（默认 60s，≤300s），到期自动从库删除
- 管理后台 `/admin`：统计、生成邀请码、删除房间/消息、封禁账号
- 禁外链 + 禁分享：文本服务端剥离 URL；UI 纯文本渲染，无分享按钮

## 本地开发
```bash
cp .env.example .env      # 本地可不填，自动回退到 file:local.db
npm install
npm run dev               # http://localhost:3000
```
> 本机构建需跳过安全删除 shim：`NODE_OPTIONS= npm run build`

## 部署到 Vercel（推荐）
1. 把本仓库推到 GitHub，在 Vercel 导入（Next.js 自动识别，无需 `vercel.json`）
2. 在 Vercel 配置以下环境变量：
   | 变量 | 说明 |
   |---|---|
   | `TURSO_URL` | 你的 Turso 库地址 `libsql://...` |
   | `TURSO_AUTH_TOKEN` | `turso db tokens create` 生成的 token |
   | `AUTH_SECRET` | `openssl rand -base64 48` 生成 |
   | `BLOB_READ_WRITE_TOKEN` | Vercel Storage → Blob 的读写 token |
   | `ADMIN_CODE` | 管理后台登录码（请设复杂值） |
3. 表结构靠 `ensureSchema()` 在首次访问自动 `CREATE TABLE IF NOT EXISTS`，无需手动 push（迁移仅供版本记录，见 `migrations/`）
4. 部署后用管理员身份调一次生成注册邀请码：
   ```bash
   curl -X POST https://<你的域名>/api/codes \
     -H "x-admin-code: <你的ADMIN_CODE>" \
     -H "Content-Type: application/json" \
     -d '{"count":10}'
   ```
   用返回的邀请码即可注册进入「广场」。

## 环境变量（.env.example）
```
TURSO_URL=file:local.db        # 本地回退；生产填 libsql://...
TURSO_AUTH_TOKEN=
AUTH_SECRET=
BLOB_READ_WRITE_TOKEN=
ADMIN_CODE=
```
