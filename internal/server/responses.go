// responses.go — OpenAI Responses API（/v1/responses）兼容层。
// Codex 等 Responses 协议客户端 → 翻译为 chat completions 发上游 →
// 上游 chat SSE 翻译回 Responses 事件流（response.created / output_text.delta /
// function_call_arguments.delta / response.completed）。
package server

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// respInputItem Responses input 数组元素（宽松解析，未知类型跳过）。
type respInputItem struct {
	Type string `json:"type"`
	// message
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
	// function_call / function_call_output
	CallID    string          `json:"call_id"`
	Name      string          `json:"name"`
	Arguments string          `json:"arguments"`
	Output    json.RawMessage `json:"output"`
}

// respTool Responses 扁平函数定义 {type:function, name, description, parameters}。
type respTool struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"`
}

// translateResponsesToChat 把 Responses 请求体翻译为 chat completions 请求体。
func translateResponsesToChat(raw []byte) ([]byte, string, error) {
	var req struct {
		Model        string          `json:"model"`
		Instructions string          `json:"instructions"`
		Input        json.RawMessage `json:"input"`
		Tools        []respTool      `json:"tools"`
		ToolChoice   any             `json:"tool_choice"`
		Stream       bool            `json:"stream"`
		Reasoning    *struct {
			Effort string `json:"effort"`
		} `json:"reasoning"`
		MaxOutputTokens *int     `json:"max_output_tokens"`
		Temperature     *float64 `json:"temperature"`
		TopP            *float64 `json:"top_p"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return nil, "", fmt.Errorf("responses parse: %w", err)
	}
	if req.Model == "" {
		return nil, "", fmt.Errorf("missing model")
	}

	chat := map[string]any{
		"model":  req.Model,
		"stream": true, // 上游只支持流式；非流式由本层聚合
	}
	var messages []map[string]any
	if strings.TrimSpace(req.Instructions) != "" {
		messages = append(messages, map[string]any{
			"role":    "system",
			"content": req.Instructions,
		})
	}

	// input：字符串 或 item 数组
	if len(req.Input) > 0 && string(req.Input) != "null" {
		var asStr string
		if err := json.Unmarshal(req.Input, &asStr); err == nil && asStr != "" {
			messages = append(messages, map[string]any{"role": "user", "content": asStr})
		} else {
			var items []respInputItem
			if err := json.Unmarshal(req.Input, &items); err != nil {
				return nil, "", fmt.Errorf("input parse: %w", err)
			}
			var pendingCalls []map[string]any // 连续 function_call 合并为一条 assistant 消息
			flushCalls := func() {
				if len(pendingCalls) > 0 {
					messages = append(messages, map[string]any{
						"role":       "assistant",
						"tool_calls": pendingCalls,
					})
					pendingCalls = nil
				}
			}
			for _, it := range items {
				switch it.Type {
				case "message":
					flushCalls()
					role := it.Role
					if role == "" {
						role = "user"
					}
					messages = append(messages, map[string]any{
						"role":    role,
						"content": contentToText(it.Content),
					})
				case "function_call":
					call := map[string]any{
						"id":   it.CallID,
						"type": "function",
						"function": map[string]any{
							"name":      it.Name,
							"arguments": it.Arguments,
						},
					}
					pendingCalls = append(pendingCalls, call)
				case "function_call_output":
					flushCalls()
					out := it.Output
					if len(out) == 0 {
						out = json.RawMessage(`""`)
					}
					messages = append(messages, map[string]any{
						"role":         "tool",
						"tool_call_id": it.CallID,
						"content":      contentToText(out),
					})
				default:
					// reasoning / item_reference 等忽略
				}
			}
			flushCalls()
		}
	}
	if len(messages) == 0 {
		return nil, "", fmt.Errorf("empty input")
	}
	chat["messages"] = messages

	if len(req.Tools) > 0 {
		tools := make([]map[string]any, 0, len(req.Tools))
		for _, t := range req.Tools {
			if t.Type != "function" || t.Name == "" {
				continue
			}
			fn := map[string]any{"name": t.Name}
			if t.Description != "" {
				fn["description"] = t.Description
			}
			if t.Parameters != nil {
				fn["parameters"] = t.Parameters
			}
			tools = append(tools, map[string]any{
				"type":     "function",
				"function": fn,
			})
		}
		if len(tools) > 0 {
			chat["tools"] = tools
			if tc := translateToolChoice(req.ToolChoice); tc != nil {
				chat["tool_choice"] = tc
			}
		}
	}
	if req.Reasoning != nil && req.Reasoning.Effort != "" {
		chat["reasoning_effort"] = req.Reasoning.Effort
	}
	if req.MaxOutputTokens != nil {
		chat["max_tokens"] = *req.MaxOutputTokens
	}
	if req.Temperature != nil {
		chat["temperature"] = *req.Temperature
	}
	if req.TopP != nil {
		chat["top_p"] = *req.TopP
	}
	out, err := json.Marshal(chat)
	if err != nil {
		return nil, "", err
	}
	return out, req.Model, nil
}

// contentToText 兼容字符串与多模态数组，拼接 text part。
func contentToText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err == nil {
		var sb strings.Builder
		for _, p := range parts {
			if p.Text != "" {
				if sb.Len() > 0 {
					sb.WriteByte('\n')
				}
				sb.WriteString(p.Text)
			}
		}
		return sb.String()
	}
	return string(raw)
}

// translateToolChoice Responses tool_choice → chat tool_choice。
func translateToolChoice(tc any) any {
	switch v := tc.(type) {
	case string:
		return v
	case map[string]any:
		if t, _ := v["type"].(string); t == "function" {
			if name, _ := v["name"].(string); name != "" {
				return name
			}
			if fn, ok := v["function"].(map[string]any); ok {
				if name, _ := fn["name"].(string); name != "" {
					return name
				}
			}
		} else if t == "auto" || t == "none" || t == "required" {
			return t
		}
	}
	return nil
}

// writeResponsesError 以 Responses 错误形状返回 HTTP 错误。
func writeResponsesError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"code":    "responses_error",
			"message": msg,
		},
	})
}

// responsesRelay 把上游 chat SSE 翻译为 Responses 事件流（stream=true）或
// 聚合为单个 response JSON（stream=false）。
func (h *Handler) responsesRelay(w http.ResponseWriter, rc io.ReadCloser, model string, stream bool) {
	respID := "resp_" + randHex(12)

	var text strings.Builder
	type fnCall struct {
		ItemID    string
		CallID    string
		Name      string
		Args      strings.Builder
		Announced bool
	}
	var fnCalls map[int]*fnCall
	var fnOrder []*fnCall
	var usage map[string]any

	itemIndex := 0
	msgItemID := "msg_0"
	msgOpened := false
	seq := 0

	emit := func(evtType string, payload map[string]any) {
		payload["type"] = evtType
		payload["sequence_number"] = seq
		seq++
		data, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evtType, data)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
	respEnvelope := func(status string, output []any) map[string]any {
		env := map[string]any{
			"id":     respID,
			"object": "response",
			"status": status,
			"model":  model,
			"output": output,
		}
		if usage != nil {
			env["usage"] = usage
		}
		return env
	}

	if stream {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		emit("response.created", map[string]any{"response": respEnvelope("in_progress", nil)})
		emit("response.in_progress", map[string]any{"response": respEnvelope("in_progress", nil)})
	}

	scanner := bufio.NewScanner(rc)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Index    *int   `json:"index"`
						ID       string `json:"id"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
			Usage map[string]any `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if chunk.Usage != nil {
			usage = chunk.Usage
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta

		if delta.Content != "" {
			if stream && !msgOpened {
				msgOpened = true
				emit("response.output_item.added", map[string]any{
					"output_index": itemIndex,
					"item": map[string]any{
						"type": "message", "id": msgItemID, "role": "assistant",
						"status": "in_progress", "content": []any{},
					},
				})
				emit("response.content_part.added", map[string]any{
					"item_id": msgItemID, "output_index": itemIndex, "content_index": 0,
					"part": map[string]any{"type": "output_text", "text": ""},
				})
			}
			if stream {
				emit("response.output_text.delta", map[string]any{
					"item_id": msgItemID, "output_index": itemIndex, "content_index": 0,
					"delta": delta.Content,
				})
			}
			text.WriteString(delta.Content)
		}

		for _, tc := range delta.ToolCalls {
			idx := 0
			if tc.Index != nil {
				idx = *tc.Index
			}
			if fnCalls == nil {
				fnCalls = make(map[int]*fnCall)
			}
			call, ok := fnCalls[idx]
			if !ok {
				call = &fnCall{ItemID: fmt.Sprintf("fc_%d", idx)}
				fnCalls[idx] = call
				fnOrder = append(fnOrder, call)
			}
			if tc.ID != "" {
				call.CallID = tc.ID
			}
			if tc.Function.Name != "" {
				call.Name = tc.Function.Name
			}
			if !call.Announced {
				call.Announced = true
				itemIndex++
				if stream {
					callID := call.CallID
					if callID == "" {
						callID = fmt.Sprintf("call_%d", idx)
						call.CallID = callID
					}
					emit("response.output_item.added", map[string]any{
						"output_index": itemIndex,
						"item": map[string]any{
							"type": "function_call", "id": call.ItemID, "call_id": callID,
							"name": call.Name, "arguments": "", "status": "in_progress",
						},
					})
				}
			}
			if tc.Function.Arguments != "" {
				if stream {
					emit("response.function_call_arguments.delta", map[string]any{
						"item_id": call.ItemID, "output_index": itemIndex,
						"delta": tc.Function.Arguments,
					})
				}
				call.Args.WriteString(tc.Function.Arguments)
			}
		}
	}

	// 组装最终 output
	output := make([]any, 0, 2)
	if text.Len() > 0 || msgOpened {
		full := text.String()
		output = append(output, map[string]any{
			"type": "message", "id": msgItemID, "role": "assistant", "status": "completed",
			"content": []any{map[string]any{"type": "output_text", "text": full}},
		})
	}
	for _, call := range fnOrder {
		callID := call.CallID
		if callID == "" {
			callID = "call_" + call.ItemID
		}
		output = append(output, map[string]any{
			"type": "function_call", "id": call.ItemID, "call_id": callID,
			"name": call.Name, "arguments": call.Args.String(), "status": "completed",
		})
	}

	if !stream {
		// 非流式：聚合为单个 response JSON
		writeJSONRaw(w, http.StatusOK, respEnvelope("completed", output))
		return
	}

	// 收尾事件
	if msgOpened {
		full := text.String()
		emit("response.output_text.done", map[string]any{
			"item_id": msgItemID, "output_index": 0, "content_index": 0, "text": full,
		})
		emit("response.content_part.done", map[string]any{
			"item_id": msgItemID, "output_index": 0, "content_index": 0,
			"part": map[string]any{"type": "output_text", "text": full},
		})
		emit("response.output_item.done", map[string]any{
			"output_index": 0,
			"item":         output[0],
		})
	}
	fnBase := 0
	if msgOpened {
		fnBase = 1
	}
	for i, call := range fnOrder {
		_ = call
		emit("response.function_call_arguments.done", map[string]any{
			"item_id": fnOrder[i].ItemID, "output_index": fnBase + i,
			"arguments": fnOrder[i].Args.String(),
		})
		emit("response.output_item.done", map[string]any{
			"output_index": fnBase + i,
			"item":         output[fnBase+i],
		})
	}
	emit("response.completed", map[string]any{
		"response": respEnvelope("completed", output),
	})
}

// responses 处理 POST /v1/responses。
func (h *Handler) responses(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 16<<20))
	if err != nil {
		writeResponsesError(w, http.StatusBadRequest, "read body: "+err.Error())
		return
	}
	chatBody, model, err := translateResponsesToChat(raw)
	if err != nil {
		writeResponsesError(w, http.StatusBadRequest, err.Error())
		return
	}
	var wantStream struct {
		Stream bool `json:"stream"`
	}
	_ = json.Unmarshal(raw, &wantStream)

	// 渠道前缀路由（与 chatCompletions 一致）
	rt, bareModel, err := h.runtimeForModel(model)
	if err != nil {
		writeResponsesError(w, http.StatusBadRequest, err.Error())
		return
	}
	chatBody, err = rewriteModel(chatBody, bareModel)
	if err != nil {
		writeResponsesError(w, http.StatusBadRequest, err.Error())
		return
	}
	_ = rt

	rc, ok := h.dispatchChat(rt, chatBody, w)
	if !ok {
		return // dispatchChat 已写错误响应
	}
	defer rc.Close()
	h.responsesRelay(w, rc, model, wantStream.Stream)
}

func randHex(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

// writeJSONRaw 写任意 JSON 值。
func writeJSONRaw(w http.ResponseWriter, status int, v any) {
	raw, _ := json.Marshal(v)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}
