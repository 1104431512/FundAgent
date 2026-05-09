# FundAgent

飞书基金助手：飞书机器人收到基金截图后，下载图片，调用 OpenAI 兼容格式的 GPT-5.5 模型，并按内置 `fund-screening` skill 返回基金评价。

## 功能

- 飞书事件回调：`POST /feishu/events`
- 管理后台：`GET /admin`
- 模型配置：Base URL、模型名、API Key、Responses / Chat Completions
- 飞书配置：App ID、App Secret、Verification Token、Encrypt Key
- 连通性测试：模型回复测试、飞书 tenant_access_token 测试
- Skill 管理视图：查看当前 skill 数量、详情、说明和文件内容
- Docker 部署：支持本地构建，也支持 GitHub Actions 发布 GHCR 镜像后服务器 `docker pull`

## 本地运行

```bash
npm install
npm start
```

打开：

```text
http://127.0.0.1:3001/admin
```

健康检查：

```bash
curl http://127.0.0.1:3001/health
```

## Docker 本地构建

```bash
docker compose up -d --build
```

打开：

```text
http://127.0.0.1:3001/admin
```

运行时配置会保存到 `data/config.json`，该目录已被 Git 忽略，并通过 Docker volume 持久化。

## Git 提交注意

不要提交 `.env` 或 `data/config.json`。它们包含飞书 App Secret 和模型 API Key。

仓库只提交 `.env.example`，服务器上复制后自行填写：

```bash
cp .env.example .env
```

也可以完全不在 `.env` 写业务密钥，启动后通过 `/admin` 管理后台保存配置。

## 飞书配置

飞书开放平台中配置事件订阅：

```text
https://你的域名/feishu/events
```

订阅事件：

```text
im.message.receive_v1
```

你已经打开 `im.message` 相关权限后，还需要发布/安装应用到目标租户。飞书测试按钮会验证 App ID / App Secret 是否能获取 `tenant_access_token`；真实消息收发需要给机器人发送一张图片做最终验证。

## Docker Pull 部署

普通 Git 仓库不能直接被 `docker pull`。本仓库已包含 GitHub Actions，推送到 GitHub 后会自动构建并发布镜像到 GHCR：

```text
ghcr.io/1104431512/fundagent:latest
```

服务器使用 `docker-compose.pull.yml` 拉取镜像运行。完整步骤见 `DEPLOY.md`。
