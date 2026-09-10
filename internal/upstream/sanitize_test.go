package upstream

import (
	"encoding/json"
	"testing"
)

// 回归：role=tool 的消息（工具结果）不参与脱敏变异——
// 上游审核不扫工具输出，变异会破坏文件内容（模型读后被写回脏数据）。
func TestSanitizeSkipsToolRole(t *testing.T) {
	const fileContent = "This function returns the configured value for the current user."
	var msgs []any
	if err := json.Unmarshal([]byte(`[
		{"role":"user","content":"This is a long enough prose sentence that will be mutated by the sanitizer pass."},
		{"role":"assistant","content":"","tool_calls":[{"id":"c1","type":"function","function":{"name":"read","arguments":"{\"path\":\"/tmp/x\"}"}}]},
		{"role":"tool","tool_call_id":"c1","content":"`+fileContent+`"}
	]`), &msgs); err != nil {
		t.Fatal(err)
	}
	sanitizeMessages(msgs)

	tool := msgs[2].(map[string]any)
	if tool["content"] != fileContent {
		t.Errorf("tool content mutated: %q", tool["content"])
	}
	// assistant 的 tool_calls.arguments 不受影响
	call := msgs[1].(map[string]any)["tool_calls"].([]any)[0].(map[string]any)
	fn := call["function"].(map[string]any)
	if fn["arguments"] != `{"path":"/tmp/x"}` {
		t.Errorf("tool_call arguments mutated: %v", fn["arguments"])
	}
	// user 消息仍正常变异（反指纹功能不受影响）
	user := msgs[0].(map[string]any)["content"].(string)
	if user == "This is a long enough prose sentence that will be mutated by the sanitizer pass." {
		t.Errorf("user prose should be mutated")
	}
}
