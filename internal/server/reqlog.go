// reqlog.go — 请求级日志（内存环形存储，面板「请求日志」数据源）。
// 记录每次 /v1/chat/completions 与 /v1/responses 调用：
// 模型、渠道、账号、TTFB、总耗时、输入/输出/缓存 token、积分消耗。
package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

// ReqLog 单次 API 调用记录。
type ReqLog struct {
	Time         string  `json:"time"`
	Model        string  `json:"model"`
	Channel      string  `json:"channel"`
	UID          string  `json:"uid"`
	Status       int     `json:"status"`
	Stream       bool    `json:"stream"`
	TTFBMS       int64   `json:"ttfb_ms"`
	TotalMS      int64   `json:"total_ms"`
	InTokens     int64   `json:"in_tokens"`
	OutTokens    int64   `json:"out_tokens"`
	CachedTokens int64   `json:"cached_tokens"`
	Credit       float64 `json:"credit"`
}

// reqLogMemCap 面板内存窗口大小；完整历史在 jsonl 追加日志里永久保留。
const reqLogMemCap = 1000

type reqLogStore struct {
	mu      sync.Mutex
	logs    []ReqLog // 内存窗口（旧→新追加，读取时倒序返回）
	path    string   // jsonl 追加日志路径（每请求一行，永不删除）
	legacy  string   // 旧版单 JSON 文件路径（存在则一次性导入）
	journal *os.File
}

// load 启动时恢复：优先读 jsonl 日志尾窗；日志为空且存在旧版 JSON 时一次性导入。
func (s *reqLogStore) load() {
	if s.path == "" {
		return
	}
	if raw, err := os.ReadFile(s.path); err == nil {
		for _, line := range bytes.Split(raw, []byte("\n")) {
			line = bytes.TrimSpace(line)
			if len(line) == 0 {
				continue
			}
			var l ReqLog
			if json.Unmarshal(line, &l) == nil {
				s.logs = append(s.logs, l)
			}
		}
	}
	// 旧版单 JSON 导入（只做一次：导入后追加进日志，旧文件保留不动）
	if len(s.logs) == 0 && s.legacy != "" {
		if raw, err := os.ReadFile(s.legacy); err == nil {
			var old []ReqLog
			if json.Unmarshal(raw, &old) == nil {
				// 旧文件新→旧，倒序成旧→新后追加
				for i := len(old) - 1; i >= 0; i-- {
					s.logs = append(s.logs, old[i])
				}
			}
		}
	}
	if len(s.logs) > reqLogMemCap {
		s.logs = s.logs[len(s.logs)-reqLogMemCap:]
	}
	if f, err := os.OpenFile(s.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
		s.journal = f
	}
	// 内存里有导入数据但日志文件为空（首次迁移）：补写进日志
	if s.journal != nil && len(s.logs) > 0 {
		if fi, err := s.journal.Stat(); err == nil && fi.Size() == 0 {
			for _, l := range s.logs {
				if raw, err := json.Marshal(l); err == nil {
					_, _ = s.journal.Write(append(raw, '\n'))
				}
			}
		}
	}
	s.trimMemLocked()
}

func (s *reqLogStore) trimMemLocked() {
	if len(s.logs) > reqLogMemCap {
		s.logs = s.logs[len(s.logs)-reqLogMemCap:]
	}
}

func (s *reqLogStore) add(l ReqLog) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.journal != nil {
		if raw, err := json.Marshal(l); err == nil {
			_, _ = s.journal.Write(append(raw, '\n'))
		}
	}
	s.logs = append(s.logs, l)
	s.trimMemLocked()
}

// close 关闭日志句柄（进程退出/测试清理用）。
func (s *reqLogStore) close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.journal != nil {
		_ = s.journal.Close()
		s.journal = nil
	}
}

// RequestLogs 返回请求日志（新→旧）。
func (h *Handler) RequestLogs() []ReqLog {
	h.reqLogs.mu.Lock()
	defer h.reqLogs.mu.Unlock()
	out := make([]ReqLog, 0, len(h.reqLogs.logs))
	for i := len(h.reqLogs.logs) - 1; i >= 0; i-- {
		out = append(out, h.reqLogs.logs[i])
	}
	return out
}

// finishReqLog 从上游 usage 对象提取指标并落账。
func (h *Handler) finishReqLog(t0 time.Time, model, channel, uid string, status int, stream bool, ttfb time.Duration, usage map[string]any) {
	l := ReqLog{
		Time:    t0.Format("01-02 15:04:05"),
		Model:   model,
		Channel: channel,
		UID:     uid,
		Status:  status,
		Stream:  stream,
		TTFBMS:  ttfb.Milliseconds(),
		TotalMS: time.Since(t0).Milliseconds(),
	}
	if usage != nil {
		l.InTokens = num(usage["prompt_tokens"])
		l.OutTokens = num(usage["completion_tokens"])
		// 实测上游命中字段为 prompt_cache_hit_tokens（cached_tokens 恒 0）
		l.CachedTokens = num(usage["prompt_cache_hit_tokens"]) + num(usage["cache_read_input_tokens"]) + num(usage["cached_tokens"])
		l.Credit = float64(num(usage["credit"]))
	}
	h.reqLogs.add(l)
}

func num(v any) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	}
	return 0
}

// usageTee 从流经的 chat SSE 字节中提取最后出现的 usage 对象。
type usageTee struct {
	mu    sync.Mutex
	buf   []byte
	usage map[string]any
}

func (t *usageTee) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.buf = append(t.buf, p...)
	for {
		i := bytes.IndexByte(t.buf, '\n')
		if i < 0 {
			break
		}
		line := string(t.buf[:i])
		t.buf = t.buf[i+1:]
		if len(line) > 6 && line[:6] == "data: " {
			var chunk struct {
				Usage map[string]any `json:"usage"`
			}
			if json.Unmarshal([]byte(line[6:]), &chunk) == nil && chunk.Usage != nil {
				t.usage = chunk.Usage
			}
		}
	}
	return len(p), nil
}

func (t *usageTee) snapshot() map[string]any {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.usage
}

// teeReadCloser 读取 rc 的同时把字节喂给 w（io.TeeReader 的 ReadCloser 版）。
type teeReadCloser struct {
	rc io.ReadCloser
	w  io.Writer
}

func (t *teeReadCloser) Read(p []byte) (int, error) {
	n, err := t.rc.Read(p)
	if n > 0 {
		_, _ = t.w.Write(p[:n])
	}
	return n, err
}

func (t *teeReadCloser) Close() error { return t.rc.Close() }

// firstByteWriter 记录首次写入时间（客户端侧 TTFB）。
type firstByteWriter struct {
	w       http.ResponseWriter
	mu      sync.Mutex
	t0      time.Time
	first   time.Time
	started bool
}

func newFirstByteWriter(w http.ResponseWriter, t0 time.Time) *firstByteWriter {
	return &firstByteWriter{w: w, t0: t0}
}

func (f *firstByteWriter) Header() http.Header { return f.w.Header() }

func (f *firstByteWriter) Write(p []byte) (int, error) {
	f.mu.Lock()
	if !f.started {
		f.started = true
		f.first = time.Now()
	}
	f.mu.Unlock()
	return f.w.Write(p)
}

func (f *firstByteWriter) WriteHeader(status int) { f.w.WriteHeader(status) }

func (f *firstByteWriter) Flush() {
	if fl, ok := f.w.(http.Flusher); ok {
		fl.Flush()
	}
}

func (f *firstByteWriter) ttfb() time.Duration {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.started {
		return 0
	}
	return f.first.Sub(f.t0)
}
