package server

import "testing"

// @think 变体：同元数据克隆 + 后缀；auto 路由别名与已带后缀的不生成。
func TestThinkVariant(t *testing.T) {
	base := map[string]any{"id": "workbuddy/kimi-k3-1", "object": "model", "created": int64(1753600000), "owned_by": "workbuddy", "context_length": 131072}
	v, ok := thinkVariant(base)
	if !ok {
		t.Fatal("expected variant for normal model")
	}
	if v["id"] != "workbuddy/kimi-k3-1@think" {
		t.Errorf("id = %v", v["id"])
	}
	if v["context_length"] != 131072 || v["owned_by"] != "workbuddy" {
		t.Errorf("metadata not cloned: %v", v)
	}
	if base["id"] != "workbuddy/kimi-k3-1" {
		t.Errorf("base entry mutated: %v", base["id"])
	}

	for _, id := range []string{"workbuddy/auto", "workbuddy/kimi-k3-1@think"} {
		if _, ok := thinkVariant(map[string]any{"id": id}); ok {
			t.Errorf("%s should not yield variant", id)
		}
	}
}
