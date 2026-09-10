package server

import (
	"bufio"
	"bytes"
	"io"
	"strings"
	"testing"
	"time"
)

// 回归：卡流探测消费的字节必须完整回放。
// flash 直出工具调用时，首个内容行携带 tool_calls 的 id/type/name，
// 丢弃会导致下游拿到无名 arguments 碎片、无法解析工具调用（回合中断）。
func TestWaitFirstContentReplay(t *testing.T) {
	upstream := strings.Join([]string{
		// 噪音首帧：role + 全空字段 + tool_calls:[]（非内容）
		`data: {"id":"cmb-1","model":"deepseek-v4.1-flash","object":"chat.completion.chunk","created":1789075546,"choices":[{"index":0,"delta":{"role":"assistant","content":"","tool_calls":[]}}]}` + "\n",
		// 首个内容行：tool_call 标识片（id/type/name，arguments 空）
		`data: {"id":"cmb-1","model":"deepseek-v4.1-flash","object":"chat.completion.chunk","created":1789075546,"choices":[{"index":0,"delta":{"content":"","tool_calls":[{"id":"call_00_X","type":"function","function":{"name":"get_weather","arguments":""},"index":0}]}}]}` + "\n",
		// 后续 arguments 碎片
		`data: {"id":"cmb-1","choices":[{"index":0,"delta":{"tool_calls":[{"function":{"name":"","arguments":"{\"city\":\"Paris\"}"},"index":0}]}}]}` + "\n",
		`data: {"id":"cmb-1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}` + "\n",
		"data: [DONE]\n",
	}, "")

	br := bufio.NewReaderSize(strings.NewReader(upstream), 64*1024)
	var sink bytes.Buffer
	if err := waitFirstContent(br, &sink); err != nil {
		t.Fatalf("waitFirstContent err=%v", err)
	}
	brc := &bufferedStream{br: br, rc: io.NopCloser(strings.NewReader("")), prefix: sink.Bytes()}
	var got bytes.Buffer
	if _, err := io.Copy(&got, brc); err != nil {
		t.Fatalf("copy err=%v", err)
	}
	if got.String() != upstream {
		t.Fatalf("replay mismatch:\n got: %s\nwant: %s", got.String(), upstream)
	}
}

// 回归：`data:` 短载荷（空串/心跳/一两个字符）不得触发 slice 越界 panic。
func TestWaitFirstContentShortPayload(t *testing.T) {
	upstream := "data:\n\n" +
		"data: x\n\n" +
		": ping\n\n" +
		"data: {\"id\":\"k\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi\"}}]}\n\n" +
		"data: [DONE]\n\n"
	br := bufio.NewReaderSize(strings.NewReader(upstream), 64*1024)
	var sink bytes.Buffer
	if err := waitFirstContent(br, &sink); err != nil {
		t.Fatalf("err=%v", err)
	}
	brc := &bufferedStream{br: br, rc: io.NopCloser(strings.NewReader("")), prefix: sink.Bytes()}
	var got bytes.Buffer
	if _, err := io.Copy(&got, brc); err != nil {
		t.Fatalf("copy err=%v", err)
	}
	if got.String() != upstream {
		t.Fatalf("replay mismatch:\n got: %q\nwant: %q", got.String(), upstream)
	}
}

// 空闲看门狗：长时间无 Read 进展时底层 body 被强制关闭（读者收到错误）。
func TestIdleWatchdog(t *testing.T) {
	pr, pw := io.Pipe() // 永不主动 EOF 的"沉默上游"
	wd := newIdleWatchdog(pr, 50*time.Millisecond)
	buf := make([]byte, 16)
	go func() { time.Sleep(10 * time.Millisecond); pw.Write([]byte("x")) }()
	if n, err := wd.Read(buf); err != nil || n != 1 {
		t.Fatalf("first read: n=%d err=%v", n, err)
	}
	// 之后保持沉默：50ms 看门狗应关掉底层 pipe，Read 返回错误
	if _, err := wd.Read(buf); err == nil {
		t.Fatal("expected error after idle timeout")
	}
	wd.Close()
}
