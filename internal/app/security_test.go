package app

import (
	"testing"
	"time"
)

// UID 白名单：路径穿越载荷必须拒绝（import 端点把 UID 拼进落盘文件名）。
func TestValidUID(t *testing.T) {
	bad := []string{
		"", "..", "/../config", "a/b", "a\\b", "a..b",
		"uid/../../etc/passwd", "a b", "a:b", "a;b",
	}
	for _, uid := range bad {
		if validUID(uid) {
			t.Errorf("validUID(%q) = true, want false", uid)
		}
	}
	good := []string{
		"013cc11f-88ea-4b36-b61f-26d071128a6e",
		"u1", "user@example", "acc.name-1",
	}
	for _, uid := range good {
		if !validUID(uid) {
			t.Errorf("validUID(%q) = false, want true", uid)
		}
	}
}

// 登录暴破防护：连续失败达阈值后进入锁定期，成功登录清零。
func TestLoginGuardLockout(t *testing.T) {
	g := &loginGuard{}
	for i := 0; i < loginFailLimit; i++ {
		if g.locked("1.2.3.4") {
			t.Fatalf("locked too early at attempt %d", i)
		}
		g.fail("1.2.3.4")
	}
	if !g.locked("1.2.3.4") {
		t.Fatal("want locked after 10 failures")
	}
	if g.locked("5.6.7.8") {
		t.Fatal("other IP must not be locked")
	}
	// 锁定到期后放行（直接模拟过期）
	g.mu.Lock()
	g.fails["1.2.3.4"].until = time.Now().Add(-time.Second)
	g.mu.Unlock()
	if g.locked("1.2.3.4") {
		t.Fatal("lock must expire")
	}
	// 成功登录清零计数
	g.reset("1.2.3.4")
	if g.locked("1.2.3.4") {
		t.Fatal("reset must clear state")
	}
}

// 会话指纹：密码不同 → 指纹不同（密码变更后旧会话作废的判定基础）。
func TestPwFingerprint(t *testing.T) {
	if pwFingerprint("a") == pwFingerprint("b") {
		t.Error("different passwords must yield different fingerprints")
	}
	if pwFingerprint("a") != pwFingerprint("a") {
		t.Error("fingerprint must be stable")
	}
}
