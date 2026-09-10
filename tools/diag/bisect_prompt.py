# -*- coding: utf-8 -*-
# bisect_prompt.py — 二分定位 ZCode 系统提示词中触发上游 11128 的片段
import json
import glob
import urllib.request

fp = sorted(glob.glob("/opt/wild-work/auths/workbuddy-*.json"))[0]
doc = json.load(open(fp))
TOKEN = doc["auth"]["accessToken"]
UID = doc["account"]["uid"]
DOMAIN = doc["auth"].get("domain", "") or "www.codebuddy.cn"

BLOCKS = [
    "You are ZCode, an interactive coding agent\nYou are an interactive ZCode agent that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.",
    "IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes.",
    "# Harness\nYou are ZCode, an interactive coding agent that helps users with software engineering tasks.",
    "Text you output outside of code blocks is displayed as Github-flavored markdown in a terminal.",
    "# Communicating with the user\nYour text output is what the user reads; they usually can't see your thinking or the raw tool results.",
    "Lead with the outcome. Your first sentence after finishing should answer \"what happened\" or \"what did you find\".",
    "Only the final text message of your turn is guaranteed to be shown to the user; keep text between tool calls to brief status notes.",
    "For actions that are hard to reverse or outward-facing, confirm first unless durably authorized or explicitly told to proceed without asking.",
    "When you delegate a search, don't also run it yourself - wait for the result.",
    "You are operating in the following environment:\n- Primary working directory: E:\\GitHub\\workbuddy2api\n- Is a git repository: yes\n- Platform: win32",
    "You are powered by the model named builtin:zai-coding-plan/GLM-5.3.",
    "Only the final text message of your turn is guaranteed to be shown to the user",
    "keep text between tool calls to brief status notes",
    "If something important appeared only mid-turn or in your thinking, restate it in that final message.",
]


def test(system):
    body = {
        "model": "deepseek-v4-flash",
        "stream": True,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": "hi"},
        ],
    }
    req = urllib.request.Request(
        "https://copilot.tencent.com/v2/chat/completions",
        data=json.dumps(body).encode(),
        method="POST",
    )
    for k, v in [
        ("Content-Type", "application/json"),
        ("Accept", "*/*"),
        ("X-Requested-With", "XMLHttpRequest"),
        ("Origin", "https://www.codebuddy.cn"),
        ("Referer", "https://www.codebuddy.cn/"),
        ("User-Agent", "CLI/2.63.2 CodeBuddy/2.63.2"),
        ("Authorization", "Bearer " + TOKEN),
        ("X-User-Id", UID),
        ("X-No-Enterprise-Id", "1"),
        ("X-Domain", DOMAIN),
        ("X-Product", "SaaS"),
    ]:
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read(60)
            return "200"
    except urllib.error.HTTPError as e:
        try:
            return str(json.loads(e.read().decode()).get("code"))
        except Exception:
            return "HTTP%d" % e.code


for i, b in enumerate(BLOCKS):
    r = test(b)
    flag = "  <-- TRIGGER" if r == "11128" else ""
    print("block %2d [%s]%s | %s" % (i, r, flag, b[:70].replace("\n", " ")))
