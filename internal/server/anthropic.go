// anthropic.go — Anthropic Messages API（/v1/messages）兼容层。
// 让 ZCode / Claude Code 等 Anthropic 协议客户端直连网关：
// 请求翻译成上游 chat 请求（复用选号/卡流检测/轮换），响应流翻译回
// Anthropic 事件（message_start / content_block_* / message_delta / message_stop），
// 原生输出 thinking 块与 tool_use 块。
package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// anthropicDefaultModel 请求模型无法识别（claude-* 等）时的兜底模型。
const anthropicDefaultModel = "glm-5.3"

var anthropicMsgSeq int64

func anthropicMsgID() string {
	return fmt.Sprintf("msg_%012x", atomic.AddInt64(&anthropicMsgSeq, 1))
}

// translateAnthropicToChat 把 Anthropic Messages 请求体翻译成上游 chat 请求体。
// 返回 chat 请求、客户端请求的模型名（回显用）与解析错误。
func translateAnthropicToChat(src []byte) (chat []byte, model string, err error) {
	var req struct {
		Model     string          `json:"model"`
		MaxTokens int             `json:"max_tokens"`
		System    json.RawMessage `json:"system"`
		Messages  []struct {
			Role    string          `json:"role"`
			Content json.RawMessage `json:"content"`
		} `json:"messages"`
		Temperature   *float64  `json:"temperature"`
		TopP          *float64  `json:"top_p"`
		StopSequences []string  `json:"stop_sequences"`
		Stream        bool      `json:"stream"`
		Tools         []any     `json:"tools"`
		ToolChoice    *struct { //nolint
			Type string `json:"type"`
			Name string `json:"name"`
		} `json:"tool_choice"`
	}
	if err := json.Unmarshal(src, &req); err != nil {
		return nil, "", fmt.Errorf("invalid JSON: %w", err)
	}
	if len(req.Messages) == 0 {
		return nil, "", fmt.Errorf("messages is required")
	}

	type oaiMsg struct {
		Role       string          `json:"role"`
		Content    json.RawMessage `json:"content,omitempty"`
		ToolCallID string          `json:"tool_call_id,omitempty"`
		ToolCalls  []any           `json:"tool_calls,omitempty"`
	}
	var msgs []any

	// system：字符串或 [{type:text,text}]
	if len(req.System) > 0 {
		if sys := anthropicBlocksToText(req.System); sys != "" {
			msgs = append(msgs, oaiMsg{Role: "system", Content: mustJSON(sys)})
		}
	}

	// tool_result 需要紧跟其 tool_use 调用；先聚合再按角色展开
	for _, m := range req.Messages {
		switch m.Role {
		case "user":
			// content 可能是纯文本或块数组；tool_result 块拆成独立 role:tool 消息
			var blocks []map[string]any
			if isJSONArray(m.Content) {
				_ = json.Unmarshal(m.Content, &blocks)
			}
			var texts []string
			var toolResults []map[string]any
			for _, b := range blocks {
				switch b["type"] {
				case "text":
					if s, _ := b["text"].(string); s != "" {
						texts = append(texts, s)
					}
				case "image":
					// 保留多模态图片（glm-5v 等可用）；其他模型上游自行忽略
					texts = append(texts, "[image omitted]")
				case "tool_result":
					toolResults = append(toolResults, b)
				}
			}
			// 纯字符串 content
			if len(blocks) == 0 {
				var s string
				if json.Unmarshal(m.Content, &s) == nil && s != "" {
					texts = append(texts, s)
				}
			}
			// OpenAI 协议要求 role:tool 消息紧跟 assistant 的 tool_calls，
			// 因此先发 tool_result，再发剩余用户文本
			for _, tr := range toolResults {
				msgs = append(msgs, oaiMsg{
					Role:       "tool",
					ToolCallID: strField(tr, "tool_use_id"),
					Content:    mustJSON(anthropicContentToText(tr["content"])),
				})
			}
			if len(texts) > 0 {
				msgs = append(msgs, oaiMsg{Role: "user", Content: mustJSON(strings.Join(texts, "\n"))})
			}
			if len(blocks) > 0 && len(texts) == 0 && len(toolResults) == 0 {
				msgs = append(msgs, oaiMsg{Role: "user", Content: mustJSON("")})
			}
		case "assistant":
			var blocks []map[string]any
			if isJSONArray(m.Content) {
				_ = json.Unmarshal(m.Content, &blocks)
			}
			var texts []string
			var toolUses []any
			for _, b := range blocks {
				switch b["type"] {
				case "text":
					if s, _ := b["text"].(string); s != "" {
						texts = append(texts, s)
					}
				case "thinking":
					// 历史 thinking 块丢弃（上游无对应承载，且不参与生成）
				case "tool_use":
					input := b["input"]
					if input == nil {
						input = map[string]any{}
					}
					toolUses = append(toolUses, map[string]any{
						"id":   strField(b, "id"),
						"type": "function",
						"function": map[string]any{
							"name":      strField(b, "name"),
							"arguments": mustMarshalString(input),
						},
					})
				}
			}
			if len(m.Content) > 0 && len(blocks) == 0 {
				var s string
				if json.Unmarshal(m.Content, &s) == nil && s != "" {
					texts = append(texts, s)
				}
			}
			am := oaiMsg{Role: "assistant", Content: mustJSON(strings.Join(texts, "\n"))}
			if len(toolUses) > 0 {
				am.ToolCalls = toolUses
			}
			msgs = append(msgs, am)
		default:
			return nil, "", fmt.Errorf("invalid role %q", m.Role)
		}
	}

	out := map[string]any{
		"messages": msgs,
		"stream":   true, // 上游恒流式（网关内聚合）
	}
	if req.MaxTokens > 0 {
		out["max_tokens"] = req.MaxTokens
	}
	if req.Temperature != nil {
		out["temperature"] = *req.Temperature
	}
	if req.TopP != nil {
		out["top_p"] = *req.TopP
	}
	if len(req.StopSequences) > 0 {
		out["stop"] = req.StopSequences
	}
	if len(req.Tools) > 0 {
		out["tools"] = anthropicToolsToOpenAI(req.Tools)
		if req.ToolChoice != nil {
			switch req.ToolChoice.Type {
			case "auto":
				out["tool_choice"] = "auto"
			case "any":
				out["tool_choice"] = "required"
			case "tool":
				if req.ToolChoice.Name != "" {
					out["tool_choice"] = req.ToolChoice.Name
				}
			case "none":
				out["tool_choice"] = "none"
			}
		}
	}
	model = strings.TrimSpace(req.Model)
	out["model"] = model
	chat, err = json.Marshal(out)
	if err != nil {
		return nil, "", err
	}
	return chat, model, nil
}

// anthropicToolsToOpenAI 把 Anthropic tools 翻译为 OpenAI function 定义。
func anthropicToolsToOpenAI(tools []any) []any {
	out := make([]any, 0, len(tools))
	for _, t := range tools {
		m, ok := t.(map[string]any)
		if !ok {
			continue
		}
		if s, _ := m["type"].(string); s != "custom" && strField(m, "name") == "" {
			continue
		}
		fn := map[string]any{
			"name":       strField(m, "name"),
			"parameters": orDefault(m["input_schema"], map[string]any{"type": "object"}),
		}
		if d, ok := m["description"].(string); ok && d != "" {
			fn["description"] = d
		}
		out = append(out, map[string]any{"type": "function", "function": fn})
	}
	return out
}

// anthropicMessages 处理 POST /v1/messages。
func (h *Handler) anthropicMessages(w http.ResponseWriter, r *http.Request) {
	t0 := time.Now()
	body, err := io.ReadAll(io.LimitReader(r.Body, 16<<20))
	if err != nil {
		anthropicError(w, http.StatusBadRequest, "invalid_request_error", "read body: "+err.Error())
		return
	}
	var peek struct {
		Model  string `json:"model"`
		Stream bool   `json:"stream"`
	}
	_ = json.Unmarshal(body, &peek)
	chatBody, model, err := translateAnthropicToChat(body)
	if err != nil {
		anthropicError(w, http.StatusBadRequest, "invalid_request_error", err.Error())
		return
	}

	rt, model, err := h.runtimeForModelWithFallback(model, anthropicDefaultModel)
	if err != nil {
		anthropicError(w, http.StatusBadRequest, "invalid_request_error", err.Error())
		return
	}
	chatBody, err = rewriteModel(chatBody, model)
	if err != nil {
		anthropicError(w, http.StatusBadRequest, "invalid_request_error", err.Error())
		return
	}

	rc, uid, ok := h.dispatchChat(rt, chatBody, w)
	if !ok {
		// dispatchChat 已按 OpenAI 错误格式写入；Anthropic 客户端也能读出 JSON 错误体
		return
	}
	defer rc.Close()
	fbw := newFirstByteWriter(w, t0)
	if peek.Stream {
		usage := anthropicRelay(fbw, rc, peek.Model)
		h.finishReqLog(t0, "anthropic/"+peek.Model, rt.Kind.String(), uid, http.StatusOK, true, fbw.ttfb(), usage)
		return
	}
	resp, err := rt.Upstream.Aggregate(rc)
	if err != nil {
		anthropicError(fbw, http.StatusBadGateway, "api_error", err.Error())
		return
	}
	usage, _ := resp["usage"].(map[string]any)
	h.finishReqLog(t0, "anthropic/"+peek.Model, rt.Kind.String(), uid, http.StatusOK, false, 0, usage)
	out := anthropicFromAggregate(resp, peek.Model)
	writeJSON(fbw, http.StatusOK, out)
}

// anthropicFromAggregate 把上游聚合响应翻译为 Anthropic message 响应。
func anthropicFromAggregate(resp map[string]any, model string) map[string]any {
	content := []any{}
	if msg := firstMessage(resp); msg != nil {
		if s, _ := msg["reasoning_content"].(string); s != "" {
			content = append(content, map[string]any{"type": "thinking", "thinking": s})
		}
		if s, _ := msg["content"].(string); s != "" {
			content = append(content, map[string]any{"type": "text", "text": s})
		}
		if tcs, ok := msg["tool_calls"].([]map[string]any); ok {
			for _, tc := range tcs {
				fn, _ := tc["function"].(map[string]any)
				input := map[string]any{}
				if args, _ := fn["arguments"].(string); args != "" {
					_ = json.Unmarshal([]byte(args), &input)
				}
				content = append(content, map[string]any{
					"type": "tool_use", "id": strField(tc, "id"),
					"name": strField(fn, "name"), "input": input,
				})
			}
		} else if tcs2, ok := msg["tool_calls"].([]any); ok {
			for _, tci := range tcs2 {
				tc, _ := tci.(map[string]any)
				if tc == nil {
					continue
				}
				fn, _ := tc["function"].(map[string]any)
				input := map[string]any{}
				if args, _ := fn["arguments"].(string); args != "" {
					_ = json.Unmarshal([]byte(args), &input)
				}
				content = append(content, map[string]any{
					"type": "tool_use", "id": strField(tc, "id"),
					"name": strField(fn, "name"), "input": input,
				})
			}
		}
	}
	if len(content) == 0 {
		content = append(content, map[string]any{"type": "text", "text": ""})
	}
	out := map[string]any{
		"id":      anthropicMsgID(),
		"type":    "message",
		"role":    "assistant",
		"model":   model,
		"content": content,
	}
	stop := "end_turn"
	if fr := firstFinishReason(resp); fr == "tool_calls" {
		stop = "tool_use"
	} else if fr == "length" {
		stop = "max_tokens"
	}
	out["stop_reason"] = stop
	if u, ok := resp["usage"].(map[string]any); ok {
		out["usage"] = anthropicUsage(u)
	} else {
		out["usage"] = map[string]any{"input_tokens": 0, "output_tokens": 0}
	}
	return out
}

// anthropicRelay 把上游 chat SSE 翻译为 Anthropic 事件流；返回 usage。
// 内容块顺序化管理：thinking → text → tool_use，每种块按需开启、切换时关闭。
func anthropicRelay(w http.ResponseWriter, rc io.ReadCloser, model string) map[string]any {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	fl, _ := w.(http.Flusher)
	msgID := anthropicMsgID()
	var (
		started    bool
		nextIdx    int
		curKind    string // "" | thinking | text | tool
		curIdx     int
		curToolIdx = -1 // 当前 tool 块对应的上游 tool_calls index
		usage      map[string]any
		stopReason = "end_turn"
	)
	emit := func(event string, payload map[string]any) {
		payload["type"] = event
		raw, err := json.Marshal(payload)
		if err != nil {
			return
		}
		_, _ = io.WriteString(w, "event: "+event+"\ndata: "+string(raw)+"\n\n")
		if fl != nil {
			fl.Flush()
		}
	}
	messageStart := func() {
		if started {
			return
		}
		started = true
		emit("message_start", map[string]any{
			"message": map[string]any{
				"id": msgID, "type": "message", "role": "assistant", "model": model,
				"content": []any{}, "stop_reason": nil, "usage": anthropicUsage(nil),
			},
		})
	}
	openBlock := func(kind string, block map[string]any, toolIdx int) {
		messageStart()
		if curKind != "" {
			emit("content_block_stop", map[string]any{"index": curIdx})
		}
		curKind, curIdx, curToolIdx = kind, nextIdx, toolIdx
		nextIdx++
		emit("content_block_start", map[string]any{"index": curIdx, "content_block": block})
	}

	sc := bufio.NewScanner(rc)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for sc.Scan() {
		line := sc.Text()
		payload, ok := trimDataPrefix(strings.TrimSpace(line))
		if !ok || payload == "" || payload == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					Reasoning string `json:"reasoning_content"`
					ToolCalls []struct {
						Index    *int   `json:"index"`
						ID       string `json:"id"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Usage map[string]any `json:"usage"`
		}
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			continue
		}
		if chunk.Usage != nil {
			usage = chunk.Usage
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		ch0 := chunk.Choices[0]
		d := ch0.Delta

		if d.Reasoning != "" {
			if curKind != "thinking" {
				openBlock("thinking", map[string]any{
					"type": "thinking", "thinking": "", "signature": "",
				}, -1)
			}
			emit("content_block_delta", map[string]any{
				"index": curIdx,
				"delta": map[string]any{"type": "thinking_delta", "thinking": d.Reasoning},
			})
		}
		if d.Content != "" {
			if curKind != "text" {
				openBlock("text", map[string]any{"type": "text", "text": ""}, -1)
			}
			emit("content_block_delta", map[string]any{
				"index": curIdx,
				"delta": map[string]any{"type": "text_delta", "text": d.Content},
			})
		}
		for _, tc := range d.ToolCalls {
			idx := 0
			if tc.Index != nil {
				idx = *tc.Index
			}
			if curKind != "tool" || curToolIdx != idx {
				id := tc.ID
				if id == "" {
					id = fmt.Sprintf("call_%d", idx)
				}
				openBlock("tool", map[string]any{
					"type": "tool_use", "id": id, "name": tc.Function.Name, "input": map[string]any{},
				}, idx)
			}
			if tc.Function.Arguments != "" {
				emit("content_block_delta", map[string]any{
					"index": curIdx,
					"delta": map[string]any{"type": "input_json_delta", "partial_json": tc.Function.Arguments},
				})
			}
		}
		switch ch0.FinishReason {
		case "tool_calls":
			stopReason = "tool_use"
		case "length":
			stopReason = "max_tokens"
		}
	}
	// 收尾：关当前块 → message_delta(stop_reason) → message_stop
	messageStart()
	if curKind != "" {
		emit("content_block_stop", map[string]any{"index": curIdx})
		curKind = ""
	}
	u := anthropicUsage(usage)
	emit("message_delta", map[string]any{
		"delta": map[string]any{"stop_reason": stopReason, "stop_sequence": nil},
		"usage": map[string]any{"output_tokens": u["output_tokens"]},
	})
	emit("message_stop", map[string]any{})
	return usage
}

// ---------- 工具函数 ----------

func anthropicError(w http.ResponseWriter, status int, typ, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type":  "error",
		"error": map[string]any{"type": typ, "message": msg},
	})
}

func anthropicUsage(u map[string]any) map[string]any {
	in, out := 0, 0
	if u != nil {
		in = int(num(u["prompt_tokens"]))
		out = int(num(u["completion_tokens"]))
	}
	return map[string]any{"input_tokens": in, "output_tokens": out}
}

func anthropicBlocksToText(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var blocks []map[string]any
	if json.Unmarshal(raw, &blocks) == nil {
		var parts []string
		for _, b := range blocks {
			if t, _ := b["text"].(string); t != "" {
				parts = append(parts, t)
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

func anthropicContentToText(v any) string {
	switch c := v.(type) {
	case string:
		return c
	case []any:
		var parts []string
		for _, p := range c {
			m, _ := p.(map[string]any)
			if m == nil {
				continue
			}
			if t, _ := m["text"].(string); t != "" {
				parts = append(parts, t)
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

func isJSONArray(raw json.RawMessage) bool {
	return len(raw) > 0 && raw[0] == '['
}

func strField(m map[string]any, k string) string {
	s, _ := m[k].(string)
	return s
}

func mustJSON(v any) json.RawMessage {
	raw, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	return raw
}

func mustMarshalString(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func orDefault(v any, def any) any {
	if v == nil {
		return def
	}
	return v
}

func firstMessage(resp map[string]any) map[string]any {
	choices, _ := resp["choices"].([]any)
	for _, ci := range choices {
		if c, ok := ci.(map[string]any); ok {
			if m, ok := c["message"].(map[string]any); ok {
				return m
			}
		}
	}
	return nil
}

func firstFinishReason(resp map[string]any) string {
	choices, _ := resp["choices"].([]any)
	for _, ci := range choices {
		if c, ok := ci.(map[string]any); ok {
			if fr, _ := c["finish_reason"].(string); fr != "" {
				return fr
			}
		}
	}
	return ""
}
