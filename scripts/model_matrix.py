#!/usr/bin/env python3
"""全模型矩阵测试：基础对话 + 工具调用，校验帧形态规范。"""
import json, time, urllib.request

KEY = open("/tmp/wb_key.txt").read().strip()
MODELS = ["workbuddy/auto", "workbuddy/hy4-preview", "workbuddy/hy3", "workbuddy/hy3-x",
          "workbuddy/deepseek-v4.1-flash", "workbuddy/glm-5.3", "workbuddy/glm-5.3-flash",
          "workbuddy/glm-5.2", "workbuddy/glm-5.1", "workbuddy/glm-5v-turbo",
          "workbuddy/kimi-k3-1", "workbuddy/kimi-k2.7", "workbuddy/kimi-k2.6",
          "workbuddy/minimax-m3", "workbuddy/deepseek-v4-pro"]

TOOLS = [{"type": "function", "function": {"name": "get_weather", "description": "Get current weather",
          "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}}]


def call(body, timeout=150):
    req = urllib.request.Request("http://127.0.0.1:7863/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
    return urllib.request.urlopen(req, timeout=timeout)


def analyze(resp):
    frames = 0; done_cnt = 0; role_first = None; content = ""; finish = None
    calls = {}; header_ok = True; ttfb = None; t0 = time.time()
    for raw in resp:
        line = raw.decode(errors="replace").strip()
        if not line.startswith("data: "):
            continue
        p = line[6:]
        if p == "[DONE]":
            done_cnt += 1
            continue
        try:
            c = json.loads(p)
        except Exception:
            continue
        frames += 1
        if ttfb is None:
            ttfb = time.time() - t0
        for k in ("id", "object", "created", "model"):
            if k not in c:
                header_ok = False
        for ch in c.get("choices", []):
            d = ch.get("delta", {})
            if d.get("role") and role_first is None:
                role_first = d["role"]
            if d.get("content"):
                content += d["content"]
            for tc in d.get("tool_calls") or []:
                i = tc.get("index", 0)
                m = calls.setdefault(i, {"id": "", "name": "", "args": ""})
                if tc.get("id"):
                    m["id"] = tc["id"]
                fn = tc.get("function") or {}
                if fn.get("name"):
                    m["name"] = fn["name"]
                m["args"] += fn.get("arguments") or ""
            if ch.get("finish_reason"):
                finish = ch["finish_reason"]
    return dict(frames=frames, done=done_cnt, role=role_first, content=content,
                finish=finish, calls=calls, header_ok=header_ok, ttfb=ttfb,
                elapsed=time.time() - t0)


def test_chat(model):
    r = analyze(call({"model": model, "stream": True,
        "messages": [{"role": "user", "content": "Reply with exactly the word OK and nothing else."}]}))
    probs = []
    if not r["content"].strip():
        probs.append("empty_content")
    if r["finish"] != "stop":
        probs.append("finish=%s" % r["finish"])
    if r["role"] != "assistant":
        probs.append("role=%s" % r["role"])
    if r["done"] != 1:
        probs.append("done=%d" % r["done"])
    if not r["header_ok"]:
        probs.append("header_missing")
    return probs, r


def test_tool(model):
    r = analyze(call({"model": model, "stream": True,
        "messages": [{"role": "user", "content": "What is the weather in Paris? Use the get_weather tool."}],
        "tools": TOOLS}))
    probs = []
    if not r["calls"]:
        probs.append("no_call finish=%s text=%r" % (r["finish"], r["content"][:50]))
    else:
        m = r["calls"][sorted(r["calls"].keys())[0]]
        if not m["id"]:
            probs.append("no_id")
        if not m["name"]:
            probs.append("no_name")
        try:
            json.loads(m["args"])
        except Exception as e:
            probs.append("args_json_bad(%s)" % e)
        if r["finish"] != "tool_calls":
            probs.append("finish=%s" % r["finish"])
    if r["role"] != "assistant":
        probs.append("role=%s" % r["role"])
    if r["done"] != 1:
        probs.append("done=%d" % r["done"])
    if not r["header_ok"]:
        probs.append("header_missing")
    return probs, r


report = []
for m in MODELS:
    line = "%-30s" % m
    try:
        probs, r = test_chat(m)
        tag = "OK" if not probs else "FAIL:" + ",".join(probs)[:60]
        line += " chat[%s %.1fs ttfb=%.1fs]" % (tag, r["elapsed"], r["ttfb"] or -1)
    except Exception as e:
        line += " chat[ERROR %s]" % str(e)[:60]
    try:
        probs, r = test_tool(m)
        tag = "OK" if not probs else "FAIL:" + ",".join(probs)[:80]
        line += " tool[%s %.1fs]" % (tag, r["elapsed"])
    except Exception as e:
        line += " tool[ERROR %s]" % str(e)[:60]
    print(line, flush=True)
    report.append(line)

open("/tmp/model_matrix_report.txt", "w").write("\n".join(report))
print("=== DONE ===", flush=True)
