// travel.go 猫猫旅行巡检 + 活跃上报（仅 WorkBuddy 上游支持，经能力断言挂载）。
// 移植自 workbuddy2api 上游：每账号单趟状态机推进，不轮询不等待。
package scheduler

import (
	"fmt"
	"log"
	"time"

	"wild-work/internal/auth"
	"wild-work/internal/upstream"
)

const (
	// travelLocationID 派出地点固定 4（古镇客栈）：4 个地点收益/时长区间相同。
	travelLocationID = 4

	travelStateIdle      = "idle"
	travelStateTraveling = "traveling"
	travelStateArrived   = "arrived"
)

// 账号间限速与账号内上报间隔：避免触发上游风控。测试可置 0。
var (
	travelAccountDelay   = 800 * time.Millisecond
	activityAccountDelay = 800 * time.Millisecond
	activityReportGap    = 1500 * time.Millisecond
)

// cstZone 上游每日重置按自然日 00:00 CST（Asia/Shanghai）。
var cstZone = time.FixedZone("CST", 8*60*60)

func travelDay(t time.Time) string { return t.In(cstZone).Format("2006-01-02") }

// travelAPI 猫猫旅行/活跃上报能力接口（仅 workbuddy 上游实现；
// 调度器经类型断言获取，traework/qoder 无此能力自然跳过）。
type travelAPI interface {
	TravelStatus(a *auth.Auth) (*upstream.TravelState, error)
	TravelDepart(a *auth.Auth, locationID int) error
	TravelClaim(a *auth.Auth, recordID int64) (int64, error)
	BuddyInfo(a *auth.Auth) (*upstream.Buddy, error)
	BuddyFirst(a *auth.Auth) error
	BuddyAgreement(a *auth.Auth) error
	GrowthStreak(a *auth.Auth) (int, error)
	ReportChatActivity(a *auth.Auth, conversationID, requestID string) error
}

// travelCap 返回上游的旅行能力视图；无该能力（非 workbuddy 平台）返回 nil。
func (s *Scheduler) travelCap() travelAPI {
	if s.cfg.Upstream == nil {
		return nil
	}
	if cap, ok := s.cfg.Upstream.(travelAPI); ok {
		return cap
	}
	return nil
}

// RunTravelNow 立即对池内所有可用账号执行一趟旅行巡检。
// 禁用账号跳过；查询失败只跳过该账号本轮；账号间限速。
// TryLock 防重入：手动触发与定时触发撞车时直接跳过，不双打上游。
func (s *Scheduler) RunTravelNow() {
	api := s.travelCap()
	if api == nil {
		return
	}
	if !s.travelMu.TryLock() {
		log.Printf("travel platform=%s: busy, skip (already running)", s.cfg.Name)
		return
	}
	defer s.travelMu.Unlock()
	first := true
	for _, st := range s.cfg.Pool.List() {
		if st.Disabled {
			continue
		}
		a := s.cfg.Pool.AuthByUID(st.UID)
		if a == nil || a.RefreshToken == "" {
			continue
		}
		if !first {
			time.Sleep(travelAccountDelay)
		}
		first = false
		s.travelOne(api, a)
	}
}

// travelOne 单账号单趟状态机：查有无猫 + 查状态 + 最多一个动作。
func (s *Scheduler) travelOne(api travelAPI, a *auth.Auth) {
	buddy, err := api.BuddyInfo(a)
	if err != nil {
		log.Printf("travel platform=%s uid=%s: buddy-info: %v", s.cfg.Name, a.UID, err)
		return
	}
	if buddy == nil {
		s.adoptBuddy(api, a, false)
		return
	}
	ts, err := api.TravelStatus(a)
	if err != nil {
		log.Printf("travel platform=%s uid=%s: status: %v", s.cfg.Name, a.UID, err)
		return
	}
	switch ts.State {
	case travelStateArrived:
		s.travelClaim(api, a, ts)
	case travelStateIdle:
		s.travelDepart(api, a, ts)
	case travelStateTraveling:
		log.Printf("travel platform=%s uid=%s: skip (traveling record=%d)", s.cfg.Name, a.UID, ts.RecordID)
	default:
		log.Printf("travel platform=%s uid=%s: skip (unknown state %q)", s.cfg.Name, a.UID, ts.State)
	}
}

// travelDepart 空闲且未达当日上限时派出（每日 1 次，自然日 00:00 CST 重置）。
func (s *Scheduler) travelDepart(api travelAPI, a *auth.Auth, ts *upstream.TravelState) {
	if ts.DailyLimitReached {
		log.Printf("travel platform=%s uid=%s: skip (daily limit reached)", s.cfg.Name, a.UID)
		return
	}
	if err := api.TravelDepart(a, travelLocationID); err != nil {
		log.Printf("travel platform=%s uid=%s: depart: %v", s.cfg.Name, a.UID, err)
		return
	}
	log.Printf("travel platform=%s uid=%s: depart ok location=%d", s.cfg.Name, a.UID, travelLocationID)
}

// travelClaim 到站领奖（必须带 record_id）。
func (s *Scheduler) travelClaim(api travelAPI, a *auth.Auth, ts *upstream.TravelState) {
	if ts.RecordID == 0 {
		log.Printf("travel platform=%s uid=%s: claim skipped (no record_id)", s.cfg.Name, a.UID)
		return
	}
	reward, err := api.TravelClaim(a, ts.RecordID)
	if err != nil {
		log.Printf("travel platform=%s uid=%s: claim record=%d: %v", s.cfg.Name, a.UID, ts.RecordID, err)
		return
	}
	log.Printf("travel platform=%s uid=%s: claim ok record=%d reward=%d", s.cfg.Name, a.UID, ts.RecordID, reward)
}

// adoptBuddy 无猫时领养：先同意协议（幂等）再 buddy/first。
// 门槛未达标（HTTP 400 first_buddy task not completed）属预期，
// 记当日已试后静默跳过。force=true 豁免当日防抖（活跃上报补满对话量后重试）。
func (s *Scheduler) adoptBuddy(api travelAPI, a *auth.Auth, force bool) {
	if !force && s.adoptTriedToday(a.UID) {
		return
	}
	if err := api.BuddyAgreement(a); err != nil {
		log.Printf("travel platform=%s uid=%s: agreement: %v", s.cfg.Name, a.UID, err)
		return
	}
	err := api.BuddyFirst(a)
	switch {
	case err == nil:
		log.Printf("travel platform=%s uid=%s: adopt ok (+300 credits)", s.cfg.Name, a.UID)
	case upstream.IsBuddyTaskIncomplete(err):
		s.markAdoptTried(a.UID)
		log.Printf("travel platform=%s uid=%s: adopt skipped (conversation threshold not reached, retry tomorrow)", s.cfg.Name, a.UID)
	default:
		log.Printf("travel platform=%s uid=%s: adopt: %v", s.cfg.Name, a.UID, err)
	}
}

// adoptTriedToday 该账号当日是否已判定领养门槛未达。
func (s *Scheduler) adoptTriedToday(uid string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.adoptTried[uid] == travelDay(time.Now())
}

// markAdoptTried 记录该账号当日已尝试领养且未过门槛。
func (s *Scheduler) markAdoptTried(uid string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.adoptTried == nil {
		s.adoptTried = map[string]string{}
	}
	s.adoptTried[uid] = travelDay(time.Now())
}

// RunActivityNow 立即对池内所有可用账号执行对话活跃上报。
// 每号 N 条（ActivityReportCount，默认 5）共用同一 conversationId、requestId 各自独立
// ——领养猫的对话量门槛实测需 5 次。上报全发满后：streak 自检 + 无猫账号立即重试领养。
func (s *Scheduler) RunActivityNow() {
	api := s.travelCap()
	if api == nil {
		return
	}
	if !s.activityMu.TryLock() {
		log.Printf("activity platform=%s: busy, skip (already running)", s.cfg.Name)
		return
	}
	defer s.activityMu.Unlock()
	count := s.activityCount()
	first := true
	for _, st := range s.cfg.Pool.List() {
		if st.Disabled {
			continue
		}
		a := s.cfg.Pool.AuthByUID(st.UID)
		if a == nil || a.AccessToken == "" {
			continue
		}
		if !first {
			time.Sleep(activityAccountDelay)
		}
		first = false
		cid := fmt.Sprintf("wb2api-%d", time.Now().UnixMilli())
		ok := 0
		for i := 1; i <= count; i++ {
			rid := fmt.Sprintf("%s-r%d", cid, i)
			if err := api.ReportChatActivity(a, cid, rid); err != nil {
				log.Printf("activity platform=%s uid=%s: report %d/%d: %v", s.cfg.Name, a.UID, i, count, err)
				break
			}
			ok++
			if i < count {
				time.Sleep(activityReportGap)
			}
		}
		if ok < count {
			continue
		}
		days, err := api.GrowthStreak(a)
		switch {
		case err != nil:
			log.Printf("WARN: activity platform=%s uid=%s: streak check failed: %v", s.cfg.Name, a.UID, err)
		case days == 0:
			log.Printf("WARN: activity platform=%s uid=%s: report OK but streak.days=0 (silent drop?)", s.cfg.Name, a.UID)
		default:
			log.Printf("activity platform=%s uid=%s: streak days=%d", s.cfg.Name, a.UID, days)
		}
		// 无猫账号对话量刚补满 → 立即重试领养（豁免当日防抖）
		if buddy, err := api.BuddyInfo(a); err == nil && buddy == nil {
			s.adoptBuddy(api, a, true)
		}
	}
}

// activityCount 读取每号上报条数（默认 5，配置可改）。
func (s *Scheduler) activityCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cfg.ActivityReportCount > 0 {
		return s.cfg.ActivityReportCount
	}
	return 5
}
