// sse.go 处理上游 SSE 流：聚合成单个 OpenAI 响应，或透传给客户端。
package upstream

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Aggregate 读取完整 SSE 流，聚合 delta.content 为单个 OpenAI chat.completion 响应。
// 分片/半行由 bufio.Reader.ReadString 处理；遇到 "data: [DONE]" 结束。
// tool_calls 以流式 delta 到达（按 index 合并：首片带 id/type/name，后续只带 arguments 片段）。
func Aggregate(r io.Reader) (map[string]any, error) {
	br := bufio.NewReaderSize(r, 64*1024)
	var (
		id, model     string
		created       float64
		content       strings.Builder
		reasoning     strings.Builder
		role          = "assistant"
		finishReason  = "stop"
		usage         map[string]any
		gotAnyContent bool
		toolCalls     = map[int]map[string]any{}
		toolOrder     []int
	)
	for {
		line, err := br.ReadString('\n')
		if err != nil && err != io.EOF {
			return nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(line, "data: ") {
			payload := strings.TrimPrefix(line, "data: ")
			if payload == "[DONE]" {
				// drain nothing; done
			} else {
				var chunk map[string]any
				if json.Unmarshal([]byte(payload), &chunk) == nil {
					if v, ok := chunk["id"].(string); ok && id == "" {
						id = v
					}
					if v, ok := chunk["model"].(string); ok && model == "" {
						model = v
					}
					if v, ok := chunk["created"].(float64); ok && created == 0 {
						created = v
					}
					if u, ok := chunk["usage"].(map[string]any); ok {
						usage = u
					}
					if ch, ok := chunk["choices"].([]any); ok {
						for _, ci := range ch {
							c, _ := ci.(map[string]any)
							if c == nil {
								continue
							}
							if fr, ok := c["finish_reason"].(string); ok && fr != "" {
								finishReason = fr
							}
							if delta, ok := c["delta"].(map[string]any); ok {
								if r2, ok := delta["role"].(string); ok && r2 != "" {
									role = r2
								}
								if txt, ok := delta["content"].(string); ok {
									content.WriteString(txt)
									gotAnyContent = true
								}
								if rc, ok := delta["reasoning_content"].(string); ok {
									reasoning.WriteString(rc)
								}
								if tcs, ok := delta["tool_calls"].([]any); ok {
									for _, tc := range tcs {
										call, ok := tc.(map[string]any)
										if !ok {
											continue
										}
										idx := 0
										if v, ok := call["index"].(float64); ok {
											idx = int(v)
										}
										merged, seen := toolCalls[idx]
										if !seen {
											merged = map[string]any{"index": idx}
											toolCalls[idx] = merged
											toolOrder = append(toolOrder, idx)
										}
										mergeToolCallDelta(merged, call)
									}
								}
							}
							// 有的上游把完整消息放在 message 里（非 delta）
							if msg, ok := c["message"].(map[string]any); ok && !gotAnyContent {
								if txt, ok := msg["content"].(string); ok {
									content.WriteString(txt)
								}
							}
						}
					}
				}
			}
		}
		if err == io.EOF {
			break
		}
	}
	if id == "" {
		id = fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano())
	}
	if created == 0 {
		created = float64(time.Now().Unix())
	}
	message := map[string]any{
		"role":    role,
		"content": content.String(),
	}
	if reasoning.Len() > 0 {
		message["reasoning_content"] = reasoning.String()
	}
	if len(toolOrder) > 0 {
		sortInts(toolOrder)
		calls := make([]map[string]any, 0, len(toolOrder))
		for _, idx := range toolOrder {
			calls = append(calls, toolCalls[idx])
		}
		message["tool_calls"] = calls
	}
	resp := map[string]any{
		"id":      id,
		"object":  "chat.completion",
		"created": int64(created),
		"model":   model,
		"choices": []any{
			map[string]any{
				"index":         0,
				"message":       message,
				"finish_reason": finishReason,
			},
		},
	}
	if usage != nil {
		resp["usage"] = usage
	}
	return resp, nil
}

// mergeToolCallDelta 把流式 tool_call 片段合并到累计对象：
// id/type/function.name 直覆盖（后续分片通常缺省），function.arguments 拼接。
func mergeToolCallDelta(merged, delta map[string]any) {
	if v, ok := delta["id"].(string); ok && v != "" {
		merged["id"] = v
	}
	if v, ok := delta["type"].(string); ok && v != "" {
		merged["type"] = v
	}
	df, _ := delta["function"].(map[string]any)
	if df == nil {
		return
	}
	mf, _ := merged["function"].(map[string]any)
	if mf == nil {
		mf = map[string]any{}
		merged["function"] = mf
	}
	if v, ok := df["name"].(string); ok && v != "" {
		mf["name"] = v
	}
	if v, ok := df["arguments"].(string); ok && v != "" {
		if prev, _ := mf["arguments"].(string); prev != "" {
			mf["arguments"] = prev + v
		} else {
			mf["arguments"] = v
		}
	}
}

// sortInts 升序排序（避免引 sort 包只为三行）。
func sortInts(a []int) {
	for i := 0; i < len(a)-1; i++ {
		for j := i + 1; j < len(a); j++ {
			if a[j] < a[i] {
				a[i], a[j] = a[j], a[i]
			}
		}
	}
}

// Stream 透传上游 SSE 到 w（每行 flush），保证至少写一个 [DONE]。
// 调用方必须先设置过 status 200；本函数自设 SSE headers。
// chunkRebuilder 把上游噪音分片重建成规范 OpenAI chunk（白名单 + 去空）。
// 背景：实测 glm-5.3 等模型的每个 delta 都携带全字段空值
// （content:""/reasoning_content:""/tool_calls:[]/function_call/extra_fields），
// 且 tool_calls 续片带空 name —— 逐字透传会让下游协议转换层
// （Anthropic 化网关/客户端）解析崩溃。重建规则：
//   - 首帧带 id/object/created/model；usage 恒透传
//   - delta 只保留非空字段（role 只发一次）
//   - tool_calls 片段剔除空 id/type/name/arguments；纯噪音帧整帧丢弃
type chunkRebuilder struct {
	headerSent bool
	roleSent   bool
}

func (rb *chunkRebuilder) rebuild(chunk map[string]any) map[string]any {
	out := map[string]any{}
	if !rb.headerSent {
		for _, k := range []string{"id", "object", "created", "model"} {
			if v, ok := chunk[k]; ok && v != nil {
				out[k] = v
			}
		}
		rb.headerSent = true
	}
	if u, ok := chunk["usage"]; ok && u != nil {
		out["usage"] = u
	}
	choices, _ := chunk["choices"].([]any)
	var outChoices []any
	for _, ci := range choices {
		c, ok := ci.(map[string]any)
		if !ok {
			continue
		}
		nc := map[string]any{}
		if v, ok := c["index"]; ok {
			nc["index"] = v
		}
		if fr, ok := c["finish_reason"].(string); ok && fr != "" {
			nc["finish_reason"] = fr
		}
		delta, _ := c["delta"].(map[string]any)
		nd := map[string]any{}
		for _, k := range []string{"content", "reasoning_content"} {
			if s, ok := delta[k].(string); ok && s != "" {
				nd[k] = s
			}
		}
		if role, ok := delta["role"].(string); ok && role != "" && !rb.roleSent {
			nd["role"] = role
			rb.roleSent = true
		}
		if tcs := cleanToolCallFragments(delta["tool_calls"]); len(tcs) > 0 {
			nd["tool_calls"] = tcs
		}
		if len(nd) > 0 || nc["finish_reason"] != nil {
			nc["delta"] = nd
			outChoices = append(outChoices, nc)
		}
	}
	if len(outChoices) > 0 {
		out["choices"] = outChoices
	}
	// 空帧（无 choices 且无 usage）整帧丢弃
	if len(out) == 0 {
		return nil
	}
	return out
}

// cleanToolCallFragments 剔除 tool_call 分片里的空值字段与纯噪音片。
func cleanToolCallFragments(v any) []map[string]any {
	tcs, ok := v.([]any)
	if !ok || len(tcs) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(tcs))
	for _, ti := range tcs {
		tc, ok := ti.(map[string]any)
		if !ok {
			continue
		}
		n := map[string]any{}
		if idx, ok := tc["index"]; ok {
			n["index"] = idx
		}
		if s, ok := tc["id"].(string); ok && s != "" {
			n["id"] = s
		}
		if s, ok := tc["type"].(string); ok && s != "" {
			n["type"] = s
		}
		if fn, ok := tc["function"].(map[string]any); ok {
			nfn := map[string]any{}
			if s, ok := fn["name"].(string); ok && s != "" {
				nfn["name"] = s
			}
			if s, ok := fn["arguments"].(string); ok && s != "" {
				nfn["arguments"] = s
			}
			if len(nfn) > 0 {
				n["function"] = nfn
			}
		}
		// 只有 index 没有任何实质内容的纯噪音片丢弃
		if len(n) <= 1 {
			continue
		}
		out = append(out, n)
	}
	return out
}

// Stream 逐行读取上游 SSE，经白名单重建后转发；保证恰好一个 [DONE]。
func Stream(w http.ResponseWriter, r io.Reader) error {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	fl, _ := w.(http.Flusher)
	br := bufio.NewReaderSize(r, 64*1024)
	sawDone := false
	rb := &chunkRebuilder{}
	write := func(payload string) error {
		if _, werr := io.WriteString(w, payload); werr != nil {
			return werr
		}
		if fl != nil {
			fl.Flush()
		}
		return nil
	}
	for {
		line, err := br.ReadString('\n')
		if line != "" {
			trimmed := strings.TrimRight(line, "\r\n")
			if strings.HasPrefix(trimmed, "data: ") {
				payload := strings.TrimPrefix(trimmed, "data: ")
				if payload == "[DONE]" {
					sawDone = true
					if werr := write("data: [DONE]\n\n"); werr != nil {
						return werr
					}
					continue
				}
				var chunk map[string]any
				if json.Unmarshal([]byte(payload), &chunk) == nil {
					if rebuilt := rb.rebuild(chunk); rebuilt != nil {
						raw, merr := json.Marshal(rebuilt)
						if merr == nil {
							if werr := write("data: " + string(raw) + "\n\n"); werr != nil {
								return werr
							}
						}
					}
				} else {
					// 非 JSON 数据行原样透传（error 帧等）
					if werr := write(line); werr != nil {
						return werr
					}
				}
			} else if trimmed != "" {
				// 非 data 行（如裸 error 事件行）原样透传
				if werr := write(line + "\n"); werr != nil {
					return werr
				}
			}
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
	}
	if !sawDone {
		if err := write("data: [DONE]\n\n"); err != nil {
			return err
		}
	}
	return nil
}
