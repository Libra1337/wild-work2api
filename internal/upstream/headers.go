// Package headers 构造三类上游请求头（common / chat / billing / refresh）。
// 规则来自 docs/api-reference.md §0/§4/§6。
package upstream

import (
	"net/http"

	"wild-work/internal/auth"
)

const (
	clientUA            = "CLI/2.63.2 CodeBuddy/2.63.2"
	originRefererCN     = "https://www.codebuddy.cn"
	originRefererGlobal = "https://www.workbuddy.ai"
)

func originRefererFor(region string) string {
	if region == "global" {
		return originRefererGlobal
	}
	return originRefererCN
}

// CommonHeaders 设置所有 API 共享的请求头（字段取自快照，并发安全）。
func CommonHeaders(req *http.Request, s auth.HeaderSnapshot) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	origin := originRefererFor(s.Region)
	req.Header.Set("Origin", origin)
	req.Header.Set("Referer", origin+"/")
	req.Header.Set("User-Agent", clientUA)
}

// ChatHeaders 在 common 之上加 chat 专属的账号头。
// 缺省字段用 X-No-* 约定（与 CodeBuddy 官方 CLI 一致）。
func ChatHeaders(req *http.Request, a *auth.Auth) {
	s := a.Snapshot()
	CommonHeaders(req, s)
	if s.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.AccessToken)
	} else {
		req.Header.Set("X-No-Authorization", "1")
	}
	if s.UID != "" {
		req.Header.Set("X-User-Id", s.UID)
	} else {
		req.Header.Set("X-No-User-Id", "1")
	}
	if s.EnterpriseID != "" {
		req.Header.Set("X-Enterprise-Id", s.EnterpriseID)
	} else {
		req.Header.Set("X-No-Enterprise-Id", "1")
	}
	// 安全红线：绝不在 chat 请求里携带 X-Refresh-Token。
	if s.Domain != "" {
		req.Header.Set("X-Domain", s.Domain)
	} else {
		req.Header.Set("X-No-Department-Info", "1")
	}
	req.Header.Set("X-Product", "SaaS")
}

// BillingHeaders billing 接口请求头（字段取自快照，并发安全）。
func BillingHeaders(req *http.Request, a *auth.Auth) {
	s := a.Snapshot()
	req.Header.Set("Authorization", "Bearer "+s.AccessToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if s.UID != "" {
		req.Header.Set("X-User-Id", s.UID)
	}
	if s.EnterpriseID != "" {
		req.Header.Set("X-Enterprise-Id", s.EnterpriseID)
		req.Header.Set("X-Tenant-Id", s.EnterpriseID)
	}
	if s.Domain != "" {
		req.Header.Set("X-Domain", s.Domain)
	}
}

// RefreshHeaders refresh 端点专属头（X-Refresh-Token 只允许出现在这里）。
// 契约：唯一调用方 RefreshToken 已持 a 写锁，此处直读字段；
// 不可改为 Snapshot（其内部读锁会与外层写锁自死锁，RWMutex 不可重入）。
func RefreshHeaders(req *http.Request, a *auth.Auth) {
	CommonHeaders(req, auth.HeaderSnapshot{
		AccessToken:  a.AccessToken,
		RefreshToken: a.RefreshToken,
		UID:          a.UID,
		EnterpriseID: a.EnterpriseID,
		Domain:       a.Domain,
		Region:       auth.RegionOf(a.Domain),
	})
	req.Header.Set("X-Refresh-Token", a.RefreshToken)
	if a.EnterpriseID != "" {
		req.Header.Set("X-Enterprise-Id", a.EnterpriseID)
	}
	req.Header.Set("X-Auth-Refresh-Source", "workbuddy")
}
