// stall.go — 上游卡流检测：流打开后限时等待首个内容块。
package server

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"time"
)

// trimDataPrefix 剥离 SSE data 前缀（兼容 "data: " 与 "data:"）。
func trimDataPrefix(line string) (string, bool) {
	if !strings.HasPrefix(line, "data:") {
		return "", false
	}
	rest := line[5:]
	if strings.HasPrefix(rest, " ") {
		rest = rest[1:]
	}
	return rest, true
}

// firstContentTimeout 首个内容块等待上限。正常模型首块在秒级到达（实测中位
// ~1.5s）；偶发排队/卡死时流长时间静默（实测 80s+ 零 token）。阈值取 15s：
// 兼顾慢启动的大上下文请求，又能在客户端（中转站 ~80s 超时）崩溃前完成换号。
const firstContentTimeout = 15 * time.Second

// waitFirstContent 逐行读取 SSE，直到出现首个「有实质内容」的块或流终止。
// 所有已消费的字节写入 sink，供上层回放——首个内容行往往携带
// tool_calls 的 id/type/name，丢弃会导致下游无法解析工具调用。
// 返回 nil 表示见到内容块（或 [DONE]/EOF 空流，交由上层正常处理）；
// 返回非 EOF 错误表示传输故障。
func waitFirstContent(br *bufio.Reader, sink *bytes.Buffer) error {
	for {
		line, err := br.ReadString('\n')
		if line != "" {
			if sink != nil && sink.Len() < 1<<20 {
				_, _ = sink.WriteString(line)
			}
			if payload, ok := trimDataPrefix(strings.TrimRight(line, "\r\n")); ok {
				if len(payload) >= 5 && payload[:5] == "[DONE" {
					return nil // 空流（上游直接结束），非卡流
				}
				if contentChunk(payload) {
					return nil
				}
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return io.EOF
			}
			return err
		}
	}
}

// contentChunk 判断 SSE data 载荷是否含实质增量（文本/思考/工具调用）。
// 纯 role 标记块（{"delta":{"role":"assistant"}}）与空串不算进度。
func contentChunk(payload string) bool {
	var c struct {
		Choices []struct {
			Delta struct {
				Content   string `json:"content"`
				Reasoning string `json:"reasoning_content"`
				ToolCalls []any  `json:"tool_calls"`
			} `json:"delta"`
		} `json:"choices"`
	}
	if json.Unmarshal([]byte(payload), &c) != nil {
		return false
	}
	if len(c.Choices) == 0 {
		return false
	}
	d := c.Choices[0].Delta
	return d.Content != "" || d.Reasoning != "" || len(d.ToolCalls) > 0
}

// bufferedStream 保留卡流检测阶段预读的字节（prefix），向调用方透明回放。
type bufferedStream struct {
	br     *bufio.Reader
	rc     io.ReadCloser
	prefix []byte
}

func (b *bufferedStream) Read(p []byte) (int, error) {
	if len(b.prefix) > 0 {
		n := copy(p, b.prefix)
		b.prefix = b.prefix[n:]
		return n, nil
	}
	return b.br.Read(p)
}

func (b *bufferedStream) Close() error { return b.rc.Close() }

// streamIdleTimeout 上游流中途空闲上限。首块有 firstContentTimeout 兜底，
// 但 body 读取无任何超时（stream transport 不约束响应体），上游中途沉默
// 会把 handler goroutine 与客户端连接挂到天荒地老。正常生成即使深度思考
// 也有持续 delta；5 分钟零字节视为死流，强制关闭换错误帧收尾。
const streamIdleTimeout = 5 * time.Minute

// idleWatchdog 上游流空闲看门狗：每次成功 Read 续期，超时未续期则关闭
// 底层 body，让所有读者（卡流探测/中继/聚合）立即以错误收场。
// timer.Reset 与 AfterFunc 回调存在良序竞争（最坏提前一个窗口关流），
// 相比永久挂死可接受。
type idleWatchdog struct {
	rc      io.ReadCloser
	timeout time.Duration
	timer   *time.Timer
}

func newIdleWatchdog(rc io.ReadCloser, d time.Duration) *idleWatchdog {
	w := &idleWatchdog{rc: rc, timeout: d}
	w.timer = time.AfterFunc(d, func() { _ = rc.Close() })
	return w
}

func (w *idleWatchdog) Read(p []byte) (int, error) {
	n, err := w.rc.Read(p)
	if err == nil && n > 0 {
		w.timer.Reset(w.timeout)
	}
	return n, err
}

func (w *idleWatchdog) Close() error {
	w.timer.Stop()
	return w.rc.Close()
}
