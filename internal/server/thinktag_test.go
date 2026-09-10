package server

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

// 流式 @think：推理包装为 <think> 正文标签，首个正文前闭合，推理字段不再下发。
func TestThinkTagWriterStream(t *testing.T) {
	// 模拟上游重建后的标准帧序列
	frames := []string{
		`data: {"id":"t1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"step one"}}]}` + "\n\n",
		`data: {"id":"t1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"reasoning_content":" step two"}}]}` + "\n\n",
		`data: {"id":"t1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"Final answer"}}]}` + "\n\n",
		`data: {"id":"t1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":9}}` + "\n\n",
		"data: [DONE]\n\n",
	}
	rec := httptest.NewRecorder()
	ttw := newThinkTagWriter(rec)
	for _, f := range frames {
		if _, err := ttw.Write([]byte(f)); err != nil {
			t.Fatal(err)
		}
	}
	ttw.Finish()
	body := rec.Body.String()

	if !strings.Contains(body, `"<think>step one"`) {
		t.Errorf("opening tag missing: %s", body)
	}
	if !strings.Contains(body, `"content":" step two"`) {
		t.Errorf("continuation missing: %s", body)
	}
	if !strings.Contains(body, `"</think>\n"`) {
		t.Errorf("closing tag frame missing: %s", body)
	}
	if !strings.Contains(body, `"content":"Final answer"`) {
		t.Errorf("text after close missing: %s", body)
	}
	if strings.Contains(body, "reasoning_content") || strings.Contains(body, `"reasoning"`) {
		t.Errorf("reasoning fields must be stripped: %s", body)
	}
	if n := strings.Count(body, "[DONE]"); n != 1 {
		t.Errorf("[DONE]=%d", n)
	}
	// usage 帧与 finish 正常透传
	if !strings.Contains(body, `"finish_reason":"stop"`) || !strings.Contains(body, `"usage"`) {
		t.Errorf("finish/usage passthrough broken: %s", body)
	}
}

// 纯推理即终止（流被截）：Finish 补闭合标签，标签配对完整。
func TestThinkTagWriterReasoningOnly(t *testing.T) {
	rec := httptest.NewRecorder()
	ttw := newThinkTagWriter(rec)
	_, _ = ttw.Write([]byte(`data: {"id":"x","choices":[{"index":0,"delta":{"reasoning_content":"partial"}}]}` + "\n\n"))
	ttw.Finish()
	body := rec.Body.String()
	if !strings.Contains(body, "<think>partial") || !strings.Contains(body, "</think>") {
		t.Errorf("unclosed think not finalized: %s", body)
	}
}

// 非流式 @think：wrapThinkTag 把推理并入正文标签并删字段。
func TestWrapThinkTagNonStream(t *testing.T) {
	resp := map[string]any{
		"choices": []any{map[string]any{
			"message": map[string]any{
				"role": "assistant", "content": "answer",
				"reasoning_content": "why",
			},
			"finish_reason": "stop",
		}},
	}
	wrapThinkTag(resp)
	msg := resp["choices"].([]any)[0].(map[string]any)["message"].(map[string]any)
	if msg["content"] != "<think>why</think>\nanswer" {
		t.Errorf("content=%q", msg["content"])
	}
	if _, has := msg["reasoning_content"]; has {
		t.Errorf("reasoning_content not deleted")
	}
	if _, has := msg["reasoning"]; has {
		t.Errorf("reasoning not deleted")
	}
}

// 无推理模型：@think 模式纯透传，不插任何标签。
func TestThinkTagWriterNoReasoning(t *testing.T) {
	rec := httptest.NewRecorder()
	ttw := newThinkTagWriter(rec)
	_, _ = ttw.Write([]byte(`data: {"id":"n","choices":[{"index":0,"delta":{"role":"assistant","content":"hi"}}]}` + "\n\n"))
	ttw.Finish()
	body := rec.Body.String()
	if strings.Contains(body, "think") {
		t.Errorf("no-reasoning stream must not contain tags: %s", body)
	}
	var chunk map[string]any
	if err := json.Unmarshal([]byte(strings.SplitN(body, "data: ", 2)[1]), &chunk); err != nil {
		t.Fatal(err)
	}
	d := chunk["choices"].([]any)[0].(map[string]any)["delta"].(map[string]any)
	if d["content"] != "hi" {
		t.Errorf("content=%v", d["content"])
	}
}

// 同帧携带推理+正文：正文不得被吞，标签先开后闭。
func TestThinkTagWriterReasoningAndContentSameFrame(t *testing.T) {
	rec := httptest.NewRecorder()
	ttw := newThinkTagWriter(rec)
	_, _ = ttw.Write([]byte(`data: {"id":"x","choices":[{"index":0,"delta":{"reasoning_content":"think","content":"answer"}}]}` + "\n\n"))
	ttw.Finish()
	body := rec.Body.String()
	if !strings.Contains(body, `"content":"<think>think</think>\nanswer"`) {
		t.Errorf("same-frame merge wrong: %s", body)
	}
}

// 终帧（finish_reason）先于闭合标签到达：闭合帧必须发在 finish 帧之前。
func TestThinkTagWriterCloseBeforeFinishFrame(t *testing.T) {
	rec := httptest.NewRecorder()
	ttw := newThinkTagWriter(rec)
	_, _ = ttw.Write([]byte(`data: {"id":"x","choices":[{"index":0,"delta":{"reasoning_content":"only think"}}]}` + "\n\n"))
	_, _ = ttw.Write([]byte(`data: {"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}` + "\n\n"))
	ttw.Finish()
	body := rec.Body.String()
	closeIdx := strings.Index(body, `"</think>\n"`)
	finishIdx := strings.Index(body, `"finish_reason":"stop"`)
	if closeIdx < 0 || finishIdx < 0 {
		t.Fatalf("frames missing: %s", body)
	}
	if closeIdx > finishIdx {
		t.Errorf("close tag must precede finish frame: %s", body)
	}
	// 闭合帧 index 缺省为 0，不得出现 null
	if strings.Contains(body, `"index":null`) {
		t.Errorf("null index emitted: %s", body)
	}
}
