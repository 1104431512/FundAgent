# FundAgent

飞书基金经理：飞书机器人收到基金截图或基金相关文本后，调用 OpenAI 兼容格式的 GPT-5.5 模型，按意图路由动态加载模块化 skills，完成识图、数据补全、分析、对比、推荐和汇总。

## 功能

- 飞书事件回调：`POST /feishu/events`
- 管理后台：`GET /admin`
- 模型配置：Base URL、模型名、API Key、Responses / Chat Completions
- 飞书配置：App ID、App Secret、Verification Token、Encrypt Key
- 连通性测试：模型回复测试、飞书 tenant_access_token 测试
- Skill 管理视图：查看当前 skill 数量、详情、说明和文件内容
- 模块化 Skills：识图、数据补全、分析、对比、推荐、汇总拆分维护，按需加载
- 运行统计：查看对话数、收到图片数、回答次数、进度消息、联网补全和错误数
- 工作流路由：截图/明确基金代码进入单基投研，推荐类文本进入基金发现，普通问题进入基金问答
- 智能意图路由：非图片/非明确代码文本会先由模型理解意图，并按需加载相关 skill；自我介绍、帮助和闲聊不会强行进入基金工作流
- 多图/图文混合：一条消息可包含多张截图和文字说明
- 联网补全：识别基金代码后自动从公开基金数据源补全基础资料和历史净值指标，再生成评价
- 份额类别与费率：识别 A/B/C/D/I 等份额类别，补全管理费、托管费、销售服务费、申购费和赎回费摘要
- 贵金属数据源：市场快照补充 COMEX 黄金/白银、沪金/沪银主连、美元指数和黄金/贵金属相关基金候选
- 持仓补全：从基金 F10 股票/债券投资明细补充普通权益、港股通、QDII、指数和债基持仓
- 风险收益计算：基于公开历史净值计算近 1/3/5 年收益、年化收益、年化波动、最大回撤、夏普率
- 飞书卡片回复：默认用交互式卡片展示进度、错误和最终分析，支持加粗、图标和彩色标题；失败时自动退回普通文本
- 虚拟基金经理：服务器定时生成每日操作、晚间估值复盘、持仓盈亏和投委会理由，并主动推送到飞书
- 持久化账本：虚拟组合、交易流水、每日估值、操作理由和数据来源保存到 `data/portfolio-db.json`
- 数据保留策略：后台可配置虚拟组合历史保留天数，手动清理过期决策、流水和估值记录
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

运行时配置会保存到 `data/config.json`，运行统计会保存到 `data/stats.json`，虚拟组合账本会保存到 `data/portfolio-db.json`，该目录已被 Git 忽略，并通过 Docker volume 持久化。

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
