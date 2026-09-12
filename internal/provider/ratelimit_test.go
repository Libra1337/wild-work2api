package provider

import (
	"testing"
	"time"
)

func TestIsModelRateLimit(t *testing.T) {
	hit := []string{
		`{"code":6004,"msg":"glm-5.3 用量超限，将在 2026-09-13 18:00:00 重置"}`,
		`{"code": 6004, "msg":"x"}`,
		`{"code":"6004","msg":"x"}`,
	}
	for _, b := range hit {
		if !IsModelRateLimit(b) {
			t.Errorf("IsModelRateLimit(%s) = false", b)
		}
	}
	miss := []string{`{"code":11140,"msg":"将在 2026-09-13 18:00:00 重置"}`, `{"code":14001}`, `{}`}
	for _, b := range miss {
		if IsModelRateLimit(b) {
			t.Errorf("IsModelRateLimit(%s) = true", b)
		}
	}
}

func TestParseSoftRateReset(t *testing.T) {
	body := `{"code":6004,"msg":"用量超限，将在 2026-09-13 18:00:00 重置"}`
	at, ok := ParseSoftRateReset(body)
	if !ok {
		t.Fatal("parse failed")
	}
	want := time.Date(2026, 9, 13, 18, 0, 0, 0, softRateResetLoc)
	if !at.Equal(want) {
		t.Errorf("at=%v want %v", at, want)
	}
	// 非 6004 带「重置」字样：不解析
	if _, ok := ParseSoftRateReset(`{"code":11140,"msg":"将在 2026-09-13 18:00:00 重置"}`); ok {
		t.Error("non-6004 reset text must not parse")
	}
	// 6004 无时间文案：不解析
	if _, ok := ParseSoftRateReset(`{"code":6004,"msg":"limited"}`); ok {
		t.Error("6004 without reset text must not parse")
	}
}
