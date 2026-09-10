// stall.go — 上游卡流检测：流打开后限时等待首个内容块。
package server

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"time"
)

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
			if len(line) > 5 && line[:5] == "data:" {
				payload := line[5:]
				if len(payload) > 0 && payload[0] == ' ' {
					payload = payload[1:]
				}
				if payload[:5] == "[DONE" {
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
