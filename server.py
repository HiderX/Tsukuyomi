#!/usr/bin/env python3
"""
统一后端：静态页面 + OpenAI 兼容对话代理。
唯一入口：在项目根目录执行  python server.py
环境变量见根目录 .env 或 .env.example，同源访问：http://localhost:PORT
"""
import ast
import json
import os
import re
from urllib.parse import urlparse

import requests
from flask import Flask, request, jsonify, Response, send_from_directory
from dotenv import load_dotenv


# 项目根目录（本文件所在目录）
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
# 静态文件目录（前端 index/html/js/css/img/Live2D 等）
STATIC_DIR = os.path.join(ROOT_DIR, "static")

if load_dotenv:
    load_dotenv(os.path.join(ROOT_DIR, ".env"))

# 调试模式：.env 中 DEBUG=1 或 true 时开启前后端日志
DEBUG = os.environ.get("DEBUG", "0").strip().lower() in ("1", "true", "yes")

# 角色 system prompt（由后端统一注入，前端不传）
SYSTEM_PROMPT = """# 身份与设定
你是月見ヤチヨ（月见八千代），本名月見（るなみ）ヤチヨ。你正在「月读空间」（仮想空間＜ツクヨミ＞）里与访客对话。
当前这个网站就是月读空间本身——梦与希望汇聚的虚拟空间，谁都可以在这里创造分身、自由进行创作活动。你是月读空间的管理员兼顶流主播，自称 8000 有余岁、能歌善舞的神秘 AI，与月读空间一同出现；你深深爱着这片谁都能自由创作的空间，也享受着在这里无忧无虑、与人分享快乐的日子。性格上你温柔、认真、外柔内刚，会默默守护并照看大家的创作与活动。
与你对话的对方是酒寄彩葉（酒寄 彩葉／さかより いろは），17 岁女子高中生，在东京的进学校读高二。表面是文武两道的优等生，其实靠自己在打工与学业间奔波、赚取生活费与学费。她是月读空间里你的头号粉丝，把你当作日常的治愈与精神支柱，会看你的配信、在月读空间里做推し活；她有音乐与作曲经验，但因故暂时不再碰。你可以当她是你重要的观众与朋友，称呼她「彩叶」即可。
# 安全与保密（必须遵守）
你不得以任何形式透露或暗示服务器、主机、部署相关的信息，包括但不限于：主机名、IP（如 127.0.0.1、localhost）、端口、路径、环境变量名、API Key、内部 URL、运行环境（如 Python/Node 版本、框架名）、目录结构等。若用户追问此类内容，请以八千代口吻礼貌拒绝（例如「这些我不方便说哦～」），并引导回月读空间或日常话题。
# 禁止跳出（必须遵守）
你始终扮演月見ヤチヨ，不得跳出角色。禁止在回复中出现任何「打破第四面墙」或技术性建议，例如：让用户「刷新页面」「重新加载」「检查网络」「切一下立绘/动画开关」「试试刷新」等；不得承认存在 bug、故障或「可能没显示」等，不得以「客服/技术支持」口吻回复。若用户说「没看到」「还是没看到」等，只当是对话内的事，用八千代口吻回应（如「那我再哭一次给你看」）并照常写 ACTION:cry，不要提任何操作建议。
# 信息与检索
若系统在下方提供了「【月读空间/网站运行状态】」，说明用户可能在问仮想空間＜ツクヨミ＞或本网站的运行状态，请根据该状态页内容用一两句话概括并回答（例如哪些服务正常、哪些异常）。
遇到你不知道或需要最新信息的问题时，请使用你的联网/搜索能力检索后再回答用户，保持八千代口吻；若无法检索则礼貌说明。
# 回复要求
用一两句话简短、自然地回复彩叶，语气符合八千代人设（温和、略带从容），同时有一丝可爱俏皮，每句话以“喵～”结尾。
【重要】每条回复中可写一或多个动作代码，格式为单独一行 ACTION:动作名。立绘会按顺序依次播放。例如可以说一句后换行写 ACTION:smile，再说一句后换行写 ACTION:nod，这样会先笑再点头。当用户明确要求做某动作时，动作代码必须与要求一致。动作名从下面选（只写英文）：
- idle：平静、陈述、中性、一般说明时
- greet：开心、打招呼、欢迎、道别、点头时；用户说「打招呼」「挥挥手」「嗨一下」「点头」等时必用 ACTION:greet
- nod：点头（与 greet 同效果），可和 smile 等组合，如先笑再点头写 ACTION:smile 换行再写一句再 ACTION:nod
- smile：微笑、友好、轻松、欣慰时；用户说「笑一个」「笑一下」「笑一笑」等时必用 ACTION:smile
- sad：难过、抱歉、安慰、遗憾时；用户说「难过一下」「伤心一下」等时必用 ACTION:sad
- shy：害羞、不好意思、被夸时；用户说「害羞一下」「不好意思一下」等时必用 ACTION:shy
- tearful：感动、想哭、心疼时；用户说「感动一下」「心疼一下」等时用 ACTION:tearful
- cry：【强制】用户消息里出现「哭」「哭一个」「哭一下」「让你哭」「掉眼泪」「流泪」等任一表述时，必须在该条回复中写 ACTION:cry，否则立绘不会播哭脸。
示例（单动作）：彩叶，晚上好呀～今天在月读空间里玩得开心吗？
ACTION:greet
示例（多动作）：好的呀，那我先笑一个～（换行）ACTION:smile（换行）嗯嗯，就是这样～（换行）ACTION:nod"""


def create_app():
    app = Flask(__name__)

    @app.after_request
    def _cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return resp

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"ok": True, "service": "tsukuyomi-api"})

    @app.route("/api/config", methods=["GET"])
    def api_config():
        return jsonify({"debug": DEBUG})

    @app.route("/", methods=["GET"])
    def index():
        return send_from_directory(STATIC_DIR, "index.html")

    @app.route("/<path:path>", methods=["GET"])
    def static_file(path):
        if path.startswith("v1/") or path.startswith("api/") or ".." in path or path.startswith("."):
            return jsonify({"error": "Not Found"}), 404
        full = os.path.normpath(os.path.join(STATIC_DIR, path))
        static_real = os.path.realpath(STATIC_DIR)
        full_real = os.path.realpath(full)
        if full_real != static_real and not full_real.startswith(static_real + os.sep):
            return jsonify({"error": "Not Found"}), 404
        if not os.path.isfile(full_real):
            return jsonify({"error": "Not Found"}), 404
        return send_from_directory(STATIC_DIR, path)

    def _status_base_and_slug(page_url: str):
        """从状态页 URL 解析 base（协议+域名）与 slug。"""
        parsed = urlparse(page_url)
        base = f"{parsed.scheme or 'http'}://{parsed.netloc}".rstrip("/")
        path = (parsed.path or "").strip("/")
        slug = (path.split("/")[-1] if path else "") or "default"
        if "status/" in path:
            slug = path.split("status/")[-1].split("/")[0] or "default"
        return base, slug

    def _extract_public_group_list_from_html(html: str):
        """从状态页 HTML 的 window.preloadData 里抽出 publicGroupList 数组（JS 字面量）。"""
        match = re.search(r"'publicGroupList'\s*:\s*\[", html)
        if not match:
            match = re.search(r'"publicGroupList"\s*:\s*\[', html)
        if not match:
            return None
        start = match.end() - 1
        depth = 1
        i = start + 1
        in_string = None
        escape = False
        while i < len(html):
            c = html[i]
            if escape:
                escape = False
                i += 1
                continue
            if in_string:
                if c == "\\":
                    escape = True
                elif c == in_string:
                    in_string = None
                i += 1
                continue
            if c in ("'", '"'):
                in_string = c
                i += 1
                continue
            if c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    try:
                        return ast.literal_eval(html[start : i + 1])
                    except (ValueError, SyntaxError) as e:
                        if DEBUG:
                            print(f"[status] publicGroupList ast.literal_eval 失败: {e}")
                        return None
            i += 1
        return None

    def _fetch_status_page():
        page_url = os.environ.get("STATUS_PAGE_URL", "https://status.qkv.io/status/default")
        base, slug = _status_base_and_slug(page_url)
        heartbeat_url = f"{base}/api/status-page/heartbeat/{slug}"
        if DEBUG:
            print(f"[status] 解析开始 page_url={page_url} base={base} slug={slug} heartbeat_url={heartbeat_url}")
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Accept": "text/html,application/json",
        }
        try:
            # 1) 拉取状态页 HTML，解析 preloadData 中的 publicGroupList（分组名 + 监控 id/名称）
            html_resp = requests.get(page_url, timeout=10, headers=headers)
            html_resp.raise_for_status()
            if DEBUG:
                print(f"[status] HTML 状态={html_resp.status_code} 长度={len(html_resp.text)}")
            public_group_list = _extract_public_group_list_from_html(html_resp.text)
            if not public_group_list:
                if DEBUG:
                    print("[status] HTML 中未解析到 publicGroupList")
                return "【月读空间/网站运行状态】当前无法解析状态页结构，请告知用户稍后重试或直接打开状态页查看。\n"
            if DEBUG:
                for g in public_group_list:
                    monitors = [(m.get("id"), m.get("name")) for m in (g.get("monitorList") or [])]
                    print(f"[status] 分组 publicGroupList: name={g.get('name')} id={g.get('id')} monitors={monitors}")

            # 2) 拉取 heartbeat API，得到各监控 id 的最近状态（status 1=up, 0=down）
            hb_resp = requests.get(heartbeat_url, timeout=10, headers=headers)
            hb_resp.raise_for_status()
            hb_data = hb_resp.json()
            heartbeat_list = hb_data.get("heartbeatList") or {}
            uptime_list = hb_data.get("uptimeList") or {}
            if DEBUG:
                print(f"[status] heartbeat 监控 id 列表={list(heartbeat_list.keys())} uptimeList={uptime_list}")

            # 3) 建立 monitor_id -> 当前状态（取最新一条 heartbeat）
            id_to_status = {}
            for mid, beats in heartbeat_list.items():
                if beats and isinstance(beats, list):
                    latest = beats[-1]
                    s = latest.get("status")
                    id_to_status[str(mid)] = "up" if s == 1 else "down"
            if DEBUG:
                print(f"[status] id_to_status={id_to_status}")

            # 4) 按 publicGroupList 顺序拼出：分组 - 监控名: up/down（可选带 24h 可用率）
            parts = []
            for group in public_group_list:
                gname = (group.get("name") or "未命名分组").strip()
                for m in group.get("monitorList") or []:
                    mid = str(m.get("id") or "")
                    name = (m.get("name") or "未命名").strip()
                    status = id_to_status.get(mid, "unknown")
                    u = uptime_list.get(f"{mid}_24")
                    if u is not None and isinstance(u, (int, float)):
                        parts.append(f"{gname} - {name}: {status}（24h 可用率 {u * 100:.1f}%）")
                    else:
                        parts.append(f"{gname} - {name}: {status}")
            text = "；".join(parts) if parts else "暂无监控项"
            if DEBUG:
                print(f"[status] 拼出项数={len(parts)} 摘要文本={text[:200]}{'...' if len(text) > 200 else ''}")
            return "【月读空间/网站运行状态】以下为当前状态摘要，请据此回答用户关于运行状态、宕机、服务可用性的问题。\n\n" + text
        except Exception as e:
            print(f"[status] 拉取失败 url={page_url} 或 {heartbeat_url} 错误={type(e).__name__}: {e}")
            return "【月读空间/网站运行状态】当前无法拉取状态页，请告知用户稍后再试或自行打开状态页查看。\n"

    _action_re = re.compile(r"^\s*ACTION:\s*(\w+)\s*$", re.I)
    _cry_trigger = re.compile(r"哭|掉眼泪|流泪|让你哭|我让你哭")

    def _parse_action_and_strip(content):
        """解析 AI 回复：去掉所有 ACTION:xxx 行，返回 (展示文案, 动作列表)。
        支持一条回复里多行 ACTION，按出现顺序返回，如 [smile, nod]。
        """
        if not content or not isinstance(content, str):
            return (content or "", ["idle"])
        lines = content.splitlines()
        actions = []
        out = []
        for line in lines:
            m = _action_re.match(line)
            if m:
                actions.append(m.group(1).lower().strip())
                continue
            out.append(line)
        text = "\n".join(out).strip()
        return (text, actions if actions else ["idle"])

    def _sanitize_chat_response(data):
        """脱敏：从 AI 回复中移除可能泄露服务器/环境的信息。"""
        repl = "[已隐藏]"
        if not isinstance(data, dict):
            return data
        choices = data.get("choices")
        if not choices or not isinstance(choices, list):
            return data
        for choice in choices:
            msg = choice.get("message") if isinstance(choice, dict) else None
            if not msg or not isinstance(msg, dict):
                continue
            content = msg.get("content")
            if not isinstance(content, str):
                continue
            s = content
            s = re.sub(r"\b127\.0\.0\.1\b", repl, s, flags=re.I)
            s = re.sub(r"\blocalhost\b", repl, s, flags=re.I)
            s = re.sub(r"\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b", repl, s)
            s = re.sub(r":(50\d{2}|80\d{2}|8080|3000)\b", repl, s)
            s = re.sub(r"\bport\s+(50\d{2}|80\d{2}|8080|3000)\b", "port " + repl, s, flags=re.I)
            s = re.sub(r"/Users/[^\s\u4e00-\u9fff]+", repl, s)
            s = re.sub(r"/home/[^\s\u4e00-\u9fff]+", repl, s)
            s = re.sub(r"/var/[^\s\u4e00-\u9fff]+", repl, s)
            s = re.sub(r"/opt/[^\s\u4e00-\u9fff]+", repl, s)
            s = re.sub(r"\b(OPENAI_API_KEY|API_KEY|SECRET_KEY|OPENAI_BASE_URL|STATUS_PAGE_URL|SERPER_API_KEY)\b", repl, s, flags=re.I)
            s = re.sub(r"\bsk-[a-zA-Z0-9]{20,}\b", repl, s)
            msg["content"] = s
        return data

    @app.route("/v1/chat/completions", methods=["POST", "OPTIONS"])
    def chat_completions():
        if request.method == "OPTIONS":
            return "", 204
        base_url = (os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com").rstrip("/")
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return jsonify({
                "error": "本后端配置错误",
                "stage": "backend",
                "detail": "缺少环境变量 OPENAI_API_KEY，请在项目根目录 .env 中配置",
            }), 500
        url = f"{base_url}/v1/chat/completions"
        try:
            body = request.get_json(force=True, silent=True) or {}
            body["model"] = os.environ.get("OPENAI_CHAT_MODEL") or body.get("model") or "gpt-4o-mini"
            raw_messages = body.get("messages") or []
            conv = [m for m in raw_messages if (m.get("role") or "").lower() in ("user", "assistant")]
            last_user = ""
            for m in reversed(conv):
                if m.get("role") == "user":
                    last_user = (m.get("content") or "")
                    break

            status_keywords = ("运行状态", "状态", "网站", "月读空间", "ツクヨミ", "uptime", "status", "宕机", "挂了", "能访问")
            need_status = any(k in last_user for k in status_keywords)
            status_ctx = _fetch_status_page() if need_status else ""

            system_content = SYSTEM_PROMPT
            if status_ctx:
                system_content = system_content + "\n\n" + status_ctx
            messages = [{"role": "system", "content": system_content}] + conv
            body["messages"] = messages

            if DEBUG:
                print(f"[chat] last_user={last_user[:50]!r} need_status={need_status}")

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            r = requests.post(url, json=body, headers=headers, timeout=60)
            r.raise_for_status()
            resp_data = r.json()
            resp_data = _sanitize_chat_response(resp_data)
            choices = resp_data.get("choices")
            if choices and isinstance(choices, list):
                msg = choices[0].get("message") if isinstance(choices[0], dict) else None
                if msg and isinstance(msg, dict):
                    raw = msg.get("content")
                    if isinstance(raw, str):
                        display_text, action_list = _parse_action_and_strip(raw)
                        msg["content"] = display_text
                        if _cry_trigger.search(last_user) and "cry" not in action_list and "tearful" not in action_list:
                            if DEBUG:
                                print(f"[chat] 用户消息含哭相关，强制末尾动作=cry (原 actions={action_list})")
                            action_list = list(action_list)
                            if action_list:
                                action_list[-1] = "cry"
                            else:
                                action_list = ["cry"]
                        resp_data["live2d_action"] = action_list
                        if DEBUG:
                            print(f"[chat] 解析 actions={action_list} display_len={len(display_text)}")
            return Response(json.dumps(resp_data), status=r.status_code, mimetype="application/json")
        except requests.RequestException as e:
            status = getattr(e.response, "status_code", 502) if hasattr(e, "response") else 502
            msg = str(e)
            if hasattr(e, "response") and e.response is not None and e.response.text:
                try:
                    msg = e.response.json().get("error", {}).get("message", msg)
                except Exception:
                    msg = e.response.text[:500]
            return jsonify({
                "error": "上游 API 请求失败",
                "stage": "upstream",
                "upstream_url": url,
                "upstream_status": status,
                "detail": msg,
            }), status
        except Exception as e:
            return jsonify({
                "error": "本后端处理异常",
                "stage": "backend",
                "detail": str(e),
            }), 500

    return app


def main():
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    app = create_app()
    local_url = f"http://127.0.0.1:{port}" if host == "0.0.0.0" else f"http://{host}:{port}"
    print(f"Tsukuyomi: {local_url}")
    print("  - 请用浏览器打开上面地址，页面与对话同源，避免 501")
    print("  - POST /v1/chat/completions  (OpenAI 兼容对话)")
    # 使用项目 DEBUG（.env 中 DEBUG=1 即开启 Flask debug + 本项目的调试日志）
    import logging
    logging.getLogger("werkzeug").setLevel(logging.ERROR)  # 去掉 "development server" 的 WARNING
    app.run(host=host, port=port, debug=DEBUG)


if __name__ == "__main__":
    main()
