# 后端（静态页面 + 对话代理）

**同源服务**：同一进程提供静态页面与 **OpenAI 兼容对话代理**。

**唯一入口**：在项目根目录执行 `python server.py`（无需 sh 脚本）。环境变量与依赖均在项目根。

## 启动

```bash
# 1. 环境变量（项目根目录）
cp .env.example .env
# 编辑 .env，至少填写 OPENAI_BASE_URL 和 OPENAI_API_KEY

# 2. 依赖（首次）
pip install -r requirements.txt

# 3. 启动（必须在项目根目录执行）
python server.py
```

启动后打开 **http://localhost:5000**（或 .env 中的 PORT）即可。

## 目录与路径

- **项目根**：`server.py`、`.env`、`requirements.txt`、`static/`
- **静态资源**：全部在 `static/` 下，如 `static/index.html`、`static/js/main.js`、`static/css/main.css`、`static/img/`、`static/yachiyo-kaguya/`（Live2D）。访问时对应 `/`、`/js/main.js`、`/img/...`、`/yachiyo-kaguya/...`。

## 环境变量（.env）

| 变量 | 说明 |
|------|------|
| `OPENAI_BASE_URL` | OpenAI 兼容 API 根地址，如 `https://api.openai.com`（不要末尾斜杠） |
| `OPENAI_API_KEY` | 对话用 API Key |
| `OPENAI_CHAT_MODEL` | 使用的模型，默认 gpt-4o-mini |
| `STATUS_PAGE_URL` | 可选。状态页 URL，用于回答「运行状态」等；不填则用默认 |
| `DEBUG` | 可选。设为 `1` 或 `true` 时开启前后端调试日志 |
| `PORT` | 端口，默认 5000 |
| `HOST` | 监听地址，默认 0.0.0.0 |

## 接口

- **GET /api/config** — 返回 `{ "debug": true/false }`，供前端决定是否打日志。
- **POST /v1/chat/completions** — OpenAI 兼容对话；system prompt 与动作解析在后端，前端只传对话历史与当前用户消息。

## 发布新 Release（jsDelivr 用）

静态资源已统一在 `static/` 下，jsDelivr 路径均为 `.../Tsukuyomi@latest/static/...`。发布步骤：

```bash
git add -A && git status
git commit -m "release: 路径与结构更新"
git tag -a v0.2.0 -m "static/ 结构，jsDelivr 路径修正"   # 版本号按需改
git push origin main
git push origin v0.2.0
```

在 GitHub 的 Releases 页面可基于该 tag 创建 Release。jsDelivr 的 `@latest` 会指向默认分支最新提交。
