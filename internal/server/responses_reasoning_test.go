package server

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// 回归：/v1/responses 中继把上游推理内容翻译为 reasoning_summary 事件
// （Codex 据此显示思考过程），且 output_index 与 completed 数组一致。
func TestResponsesRelayReasoning(t *testing.T) {
	upstream := strings.Join([]string{
		`data: {"id":"x","model":"gpt-5","choices":[{"index":0,"delta":{"role":"assistant","content":"","reasoning_content":"step one"}}]}`, "",
		`data: {"id":"x","choices":[{"index":0,"delta":{"content":"","reasoning_content":" step two"}}]}`, "",
		`data: {"id":"x","choices":[{"index":0,"delta":{"content":"Final answer"}}]}`, "",
		`data: {"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":9}}`, "",
		"data: [DONE]", "",
	}, "\n")
	rec := httptest.NewRecorder()
	usage, _ := (&Handler{}).responsesRelay(rec, io.NopCloser(strings.NewReader(upstream)), "gpt-5", true, time.Now())
	body := rec.Body.String()

	for _, want := range []string{
		"event: response.output_item.added", `"type":"reasoning"`,
		"event: response.reasoning_summary_part.added",
		"event: response.reasoning_summary_text.delta", `"delta":"step one"`,
		"event: response.reasoning_summary_text.done", `"step one step two"`,
		"event: response.reasoning_summary_part.done",
		"event: response.output_item.done",
		"event: response.output_text.delta", `"Final answer"`,
		"event: response.completed",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q", want)
		}
	}
	if usage == nil || num(usage["completion_tokens"]) != 9 {
		t.Errorf("usage=%v", usage)
	}
	// reasoning 项在前（output_index 0），文本项在后（1）
	if !strings.Contains(body, `"item":{"id":"rs_0","summary":[],"type":"reasoning"},"output_index":0`) {
		t.Errorf("reasoning item index/done payload wrong:\n%s", body)
	}
}

// 非流式：reasoning 项进入 output 数组首位。
func TestResponsesRelayReasoningNonStream(t *testing.T) {
	upstream := strings.Join([]string{
		`data: {"id":"x","choices":[{"index":0,"delta":{"reasoning_content":"thinking"}}]}`, "",
		`data: {"id":"x","choices":[{"index":0,"delta":{"content":"answer"}}]}`, "",
		"data: [DONE]", "",
	}, "\n")
	rec := httptest.NewRecorder()
	_, _ = (&Handler{}).responsesRelay(rec, io.NopCloser(strings.NewReader(upstream)), "gpt-5", false, time.Now())
	body := rec.Body.String()
	if !strings.Contains(body, `"type":"reasoning"`) || !strings.Contains(body, `"thinking"`) {
		t.Errorf("non-stream reasoning item missing: %s", body)
	}
}
