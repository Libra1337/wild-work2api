// reqlog.go — 请求级日志（内存环形存储，面板「请求日志」数据源）。
// 记录每次 /v1/chat/completions 与 /v1/responses 调用：
// 模型、渠道、账号、TTFB、总耗时、输入/输出/缓存 token、积分消耗。
package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
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

const reqLogCap = 300

type reqLogStore struct {
	mu   sync.Mutex
	logs []ReqLog
}

func (s *reqLogStore) add(l ReqLog) {
	s.mu.Lock()
	defer s.mu.Unlock()
	logs := append([]ReqLog{l}, s.logs...) // 新的在前
	if len(logs) > reqLogCap {
		logs = logs[:reqLogCap]
	}
	s.logs = logs
}

// RequestLogs 返回请求日志（新→旧）。
func (h *Handler) RequestLogs() []ReqLog {
	h.reqLogs.mu.Lock()
	defer h.reqLogs.mu.Unlock()
	out := make([]ReqLog, len(h.reqLogs.logs))
	copy(out, h.reqLogs.logs)
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
		l.CachedTokens = num(usage["cached_tokens"]) + num(usage["cache_read_input_tokens"])
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
