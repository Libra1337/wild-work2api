package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// 永久保留回归：日志追加到 jsonl 不删除；内存窗口裁剪不影响磁盘记录；
// 重启后从日志恢复；旧版单 JSON 首次自动导入。
func TestReqLogJournalPersistence(t *testing.T) {
	dir := t.TempDir()
	journal := filepath.Join(dir, "request_logs.jsonl")
	legacy := filepath.Join(dir, "request_logs.json")

	// 旧版数据（新→旧）
	old := []ReqLog{{Time: "t1", Model: "m1"}, {Time: "t0", Model: "m0"}}
	raw, _ := json.Marshal(old)
	if err := os.WriteFile(legacy, raw, 0o600); err != nil {
		t.Fatal(err)
	}

	s := &reqLogStore{path: journal, legacy: legacy}
	s.load()
	if len(s.logs) != 2 || s.logs[0].Time != "t0" || s.logs[1].Time != "t1" {
		t.Fatalf("legacy import order wrong: %+v", s.logs)
	}
	s.add(ReqLog{Time: "t2", Model: "m2"})
	s.close()

	// 重启：从 jsonl 恢复（旧 JSON 不再导入）
	s2 := &reqLogStore{path: journal, legacy: legacy}
	s2.load()
	if len(s2.logs) != 3 || s2.logs[2].Time != "t2" {
		t.Fatalf("journal reload wrong: %+v", s2.logs)
	}
	// 新→旧读取顺序
	got := (&Handler{reqLogs: *s2}).RequestLogs()
	if len(got) != 3 || got[0].Time != "t2" || got[2].Time != "t0" {
		t.Fatalf("RequestLogs order wrong: %+v", got)
	}

	// 超过内存窗口：磁盘仍保留全部
	for i := 0; i < reqLogMemCap+50; i++ {
		s2.add(ReqLog{Time: "bulk", Model: "mb"})
	}
	s2.close()
	if len(s2.logs) != reqLogMemCap {
		t.Fatalf("mem window = %d, want %d", len(s2.logs), reqLogMemCap)
	}
	cnt := 0
	if raw, err := os.ReadFile(journal); err == nil {
		for _, ln := range allLines(raw) {
			if len(ln) > 0 {
				cnt++
			}
		}
	}
	if cnt != 3+reqLogMemCap+50 {
		t.Fatalf("journal lines = %d, want %d", cnt, 3+reqLogMemCap+50)
	}
}

func allLines(raw []byte) [][]byte {
	var out [][]byte
	start := 0
	for i, b := range raw {
		if b == '\n' {
			out = append(out, raw[start:i])
			start = i + 1
		}
	}
	if start < len(raw) {
		out = append(out, raw[start:])
	}
	return out
}
