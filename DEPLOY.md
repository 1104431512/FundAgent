# Docker 部署

## 关键结论

`docker pull` 只能拉镜像仓库，不能直接拉普通 Git 源码仓库。

本项目支持两种方式：

1. 服务器 `git clone` 后本地构建：`docker compose up -d --build`
2. GitHub Actions 自动构建 GHCR 镜像后服务器拉取：`docker pull ghcr.io/1104431512/fundagent:latest`

推荐第 2 种。

## 方式一：服务器拉源码并构建

```bash
git clone https://github.com/1104431512/FundAgent.git
cd FundAgent
cp .env.example .env
docker compose up -d --build
```

如果想通过网页后台录入密钥，可以先不在 `.env` 里写业务密钥，启动后打开：

```text
http://服务器IP:3001/admin
```

检查：

```bash
docker compose ps
curl http://127.0.0.1:3001/health
```

更新：

```bash
git pull
docker compose up -d --build
```

## 方式二：GitHub 自动发布镜像，服务器 docker pull

仓库已包含：

```text
.github/workflows/docker-publish.yml
```

推送到 `main` 或 `master` 后会自动发布镜像：

```text
ghcr.io/1104431512/fundagent:latest
```

服务器准备目录：

```bash
mkdir -p /opt/fundagent
cd /opt/fundagent
curl -O https://raw.githubusercontent.com/1104431512/FundAgent/main/docker-compose.pull.yml
curl -O https://raw.githubusercontent.com/1104431512/FundAgent/main/.env.example
cp .env.example .env
```

编辑 `.env`，设置：

```env
DOCKER_IMAGE=ghcr.io/1104431512/fundagent:latest
PORT=3001
HOST=0.0.0.0
```

启动：

```bash
docker compose -f docker-compose.pull.yml pull
docker compose -f docker-compose.pull.yml up -d
```

更新：

```bash
docker compose -f docker-compose.pull.yml pull
docker compose -f docker-compose.pull.yml up -d
```

如果 GHCR 镜像是私有的，服务器先登录：

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## 配置持久化

管理后台保存的配置在容器内：

```text
/app/data/config.json
```

Compose 已挂载：

```text
./data:/app/data
```

所以容器重建后配置不会丢。不要把 `data/config.json` 提交到 Git。

## Nginx 反向代理

飞书回调要求公网 HTTPS。Nginx 示例：

```nginx
location /feishu/events {
    proxy_pass http://127.0.0.1:3001/feishu/events;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /admin {
    proxy_pass http://127.0.0.1:3001/admin;
    proxy_set_header Host $host;
}

location /public/ {
    proxy_pass http://127.0.0.1:3001/public/;
    proxy_set_header Host $host;
}

location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_set_header Host $host;
}
```

飞书事件订阅 URL：

```text
https://你的域名/feishu/events
```
