# wild-work2api

> 把 WorkBuddy(CodeBuddy)、TraeWork、Qoder 的多个账号聚合成一个 **OpenAI 兼容 API**，自带 Web 管理控制台，Docker 一键部署。

![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white&style=flat-square)
![API](https://img.shields.io/badge/API-OpenAI_Compatible-412991?style=flat-square)
![WebUI](https://img.shields.io/badge/WebUI-React_19_·_Tailwind_4-61DAFB?style=flat-square)
![Deploy](https://img.shields.io/badge/Deploy-Docker_Compose-2496ED?logo=docker&logoColor=white&style=flat-square)

## 项目简介

wild-work2api 是一个自托管的多渠道账号聚合网关：

- **三渠道聚合**：WorkBuddy(腾讯 CodeBuddy) + TraeWork(字节) + Qoder(阿里)，模型 ID 带渠道前缀路由（`workbuddy/<model>`、`traework/<model>`、`qoder/<model>`）
- **Web 控制台**：浏览器里添加账号（OAuth 授权自动导入）、签到、刷新积分、停用、删除、查看费率与日志——全部自助，无需命令行
- **账号池治理**：粘性路由优先复用同账号以利用会话缓存、每日定时签到领额度、token 保活、冷却状态机
- **OpenAI 兼容**：`/v1/chat/completions`、`/v1/models`，支持流式/非流式，现有 SDK 零改造接入
- **单二进制**：Go + go:embed，Web 控制台直接打进二进制，无外部依赖

> [!NOTE]
> 本项目衍生自 [rockswang/wild-work](https://github.com/rockswang/wild-work)（MIT），其前身为 [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api)。在此基础上重写了 Web 控制台（React 19 + Tailwind CSS 4）并增加了 Docker 部署方案。

> [!WARNING]
> 本项目是**非官方**网关，通过逆向上游客户端接口工作。仅供个人学习研究，请遵守各上游平台服务条款，仅使用本人授权的账号。详见[免责声明](#免责声明)。

## 快速开始（Docker，推荐）

```bash
git clone https://github.com/Libra1337/wild-work2api.git
cd wild-work2api
cp config.example.json config.json   # 编辑 api_key（公网部署必须设置）
docker compose up -d --build
```

启动后：

- **Web 控制台**：`http://<host>:7863/` → 点「添加账号」→ 浏览器完成 OAuth 登录 → 自动导入
- **API**：`http://<host>:7863/v1` + Bearer `api_key`

首次构建会先编译前端（Node 阶段）再编译 Go，产物全部打进镜像。

### 桌面模式（Windows/macOS）

```bash
go build -o wild-work ./cmd/wild-work && ./wild-work        # 系统托盘常驻
./wild-work --no-tray                                        # Linux 无头模式
```

## Web 控制台

| 页面 | 功能 |
|---|---|
| 总览 | 统计卡（账号/积分/可用数/下次签到）、按渠道分组的账号卡片、单账号签到/刷新/停用/删除、批量操作 |
| 费率 | 各渠道模型定价表，一键从上游刷新 |
| 日志 | 最近 300 行运行日志，自动刷新 |
| 设置 | API Base URL / Key 查看复制与修改、签到时间、服务信息 |

**添加账号流程**：选择渠道 → 浏览器打开授权页 → 登录 → 面板自动完成导入（签到、入池）。多账号重复操作即可。

> [!IMPORTANT]
> 控制台的 `/api/*` 管理接口**无内置鉴权**（上游 wild-work 的单机设计）。公网部署时务必置于反代之后并对面板路径加访问控制（如 Caddy `basic_auth` / nginx basic auth），仅放行 `/v1/*`、`/healthz` 等走 Bearer key 的端点。

### 反代示例（Caddy）

```caddyfile
api.example.com {
    @api path /v1/* /healthz /status
    handle @api {
        reverse_proxy 127.0.0.1:7863 {
            flush_interval -1    # SSE 流式必需
        }
    }
    handle {
        basic_auth {
            admin <bcrypt-hash>  # caddy hash-password 生成
        }
        reverse_proxy 127.0.0.1:7863
    }
}
```

## 客户端接入

```
Base URL: http://<host>:7863/v1
API Key:  <config.json 中的 api_key>
```

模型 ID 必须带渠道前缀：

```bash
# 流式对话
curl -N http://localhost:7863/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"workbuddy/deepseek-v4-flash","messages":[{"role":"user","content":"hi"}],"stream":true}'

# 模型列表（当前可用模型）
curl http://localhost:7863/v1/models -H "Authorization: Bearer your-api-key"
```

| 端点 | 鉴权 | 说明 |
|---|---|---|
| `POST /v1/chat/completions` | Bearer | OpenAI 兼容补全，流式/非流式 |
| `GET /v1/models` | Bearer | 各渠道可用模型（带前缀） |
| `GET /status` | Bearer | 账号池状态 |
| `GET /healthz` | 无 | 健康检查 |

## 配置说明

完整样例见 [`config.example.json`](config.example.json)：

| 字段 | 默认 | 说明 |
|---|---|---|
| `listen.host` / `port` | `127.0.0.1` / `7863` | HTTP 监听（容器内需 `0.0.0.0`） |
| `api_key` | — | 网关鉴权密钥；面板中可运行时修改 |
| `auth_dir` | `./auths` | 账号凭证目录（明文，注意权限） |
| `state_file` | `./data/state.json` | 账号池状态持久化 |
| `cooldown.*` | 见样例 | 硬冷却（余额耗尽）/ 软冷却（频控）/ 连续错误阈值与退避 |
| `schedule.checkin_times` | `["09:00","21:00"]` | 每日签到时间点（本地时区） |
| `schedule.keepalive_hours` | `[22]` | token 保活整点 |
| `upstream.timeout_seconds` | `120` | 短 RPC 超时 |

账号凭证按渠道命名落盘于 `auths/`：`workbuddy-<uid>.json`、`trae-*.json`、`qoder-*.json`。备份 `auths/` 与 `data/` 即可迁移。

## 开发

```bash
# 后端
go build ./... && go vet ./... && go test ./...

# 前端（Web 控制台）
cd webui
pnpm install
pnpm dev              # 开发服务器，/api 代理到 127.0.0.1:7863
pnpm build:embed      # 构建并注入 ../cmd/wild-work/web（go:embed）

# 完整构建（Docker 自动执行上述两步）
docker compose up -d --build
```

### 目录结构

```
cmd/wild-work/     # 入口（daemon + 托盘 + 无头模式）
  web/             # Web 控制台构建产物（go:embed，由 webui/ 生成）
internal/
  app/             # 管理 API（/api/*）+ 面板数据
  server/          # OpenAI 兼容端点 + 模型前缀路由 + 粘性路由
  pool/            # 账号池（状态机/冷却/持久化）
  scheduler/       # 定时签到 + token 保活
  upstream/        # WorkBuddy 上游封装
  traework/ qoder/ # TraeWork / Qoder 上游封装
  auth/ config/ platform/ systray/ provider/
webui/             # Web 控制台源码（React 19 + Tailwind 4 + shadcn 风格）
docs/              # 上游逆向笔记
```

## 免责声明

本项目仅供学习和研究使用。上游接口为非公开的逆向接口，不保证可用性与稳定性。使用者需遵守各上游平台服务条款，自行承担使用风险（包括账号封禁等）。作者不对任何因使用本项目产生的直接或间接损失负责。

## License

[MIT](LICENSE)
