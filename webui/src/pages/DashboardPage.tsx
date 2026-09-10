import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coins,
  Key,
  Pencil,
  Radio,
  Settings2,
  Shield,
  Snowflake,
  Clock,
} from "lucide-react"

import { usePolling } from "@/hooks/use-polling"
import { api } from "@/lib/api-client"
import type { AppState } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const CHANNEL_LABEL: Record<string, string> = {
  workbuddy: "WorkBuddy",
  traework: "TraeWork",
  qoder: "Qoder",
}

interface StatCardProps {
  icon: ReactNode
  title: string
  value: ReactNode
  detail?: ReactNode
  loading: boolean
}

function StatCard({ icon, title, value, detail, loading }: StatCardProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">
              {title}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : (
              <div className="mt-1 truncate text-2xl font-bold tracking-tight">
                {value}
              </div>
            )}
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-4 w-32" />
        ) : detail ? (
          <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ActivityMetric({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: ReactNode
  tone?: "default" | "success" | "destructive" | "warning"
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
  }[tone]

  return (
    <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}

function PoolOverviewCard({
  data,
  loading,
}: {
  data?: AppState
  loading: boolean
}) {
  const accounts = data?.accounts ?? []
  const total = accounts.length
  const available = accounts.filter((a) => !a.disabled && !a.cooling).length
  const cooling = accounts.filter((a) => a.cooling).length
  const disabled = accounts.filter((a) => a.disabled).length
  const availablePercent = total > 0 ? Math.round((available / total) * 100) : 0
  const coolingPercent = total > 0 ? Math.round((cooling / total) * 100) : 0
  const quietPercent = Math.max(100 - availablePercent - coolingPercent, 0)

  const byChannel = (ch: string) => accounts.filter((a) => a.group === ch)
  const creditsOf = (list: typeof accounts) =>
    list.reduce((sum, a) => sum + a.credits, 0)

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Activity className="size-4 text-primary" />
          账号池概览
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <ActivityMetric label="总账号" value={total} />
              <ActivityMetric label="可用" value={available} tone="success" />
              <ActivityMetric label="冷却中" value={cooling} tone="warning" />
              <ActivityMetric label="已停用" value={disabled} tone="destructive" />
              <ActivityMetric
                label="总积分"
                value={creditsOf(accounts).toLocaleString()}
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["workbuddy", "traework", "qoder"] as const).map((ch) => {
                const list = byChannel(ch)
                return (
                  <div
                    key={ch}
                    className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5"
                  >
                    <p className="text-[11px] text-muted-foreground">
                      {CHANNEL_LABEL[ch]}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {list.length} 个账号 ·{" "}
                      <span className="text-primary">
                        {creditsOf(list).toLocaleString()} 积分
                      </span>
                    </p>
                  </div>
                )
              })}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>可用 {availablePercent}%</span>
                <span>冷却 {coolingPercent}%</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-success"
                  style={{ width: `${availablePercent}%` }}
                />
                <div
                  className="bg-warning"
                  style={{ width: `${coolingPercent}%` }}
                />
                <div
                  className="bg-muted-foreground/15"
                  style={{ width: `${quietPercent}%` }}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function AttentionAccountRow({
  nickname,
  channel,
  reason,
  until,
}: {
  nickname: string
  channel: string
  reason: string
  until: string
}) {
  return (
    <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-left">
      <div className="flex size-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
        <Snowflake className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{nickname}</span>
          <Badge variant="secondary" className="text-[10px]">
            {CHANNEL_LABEL[channel] ?? channel}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {reason || "冷却中"}
        </p>
      </div>
      <div className="text-right text-[10px] text-muted-foreground">
        {until || "-"}
      </div>
    </div>
  )
}

function AttentionAccountsCard({
  data,
  loading,
}: {
  data?: AppState
  loading: boolean
}) {
  const accounts = data?.accounts ?? []
  const attention = accounts.filter((a) => a.cooling || a.disabled)

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-warning" />
            需要关注
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : attention.length > 0 ? (
          <div className="space-y-1">
            {attention.map((item) => (
              <AttentionAccountRow
                key={item.uid}
                nickname={item.nickname || item.uid.slice(0, 8)}
                channel={item.group}
                reason={item.disabled ? "已停用" : item.reason}
                until={item.disabled ? "-" : item.until}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-8 text-center">
            <CheckCircle2 className="mx-auto size-7 text-success" />
            <p className="mt-2 text-sm font-medium">账号池状态良好</p>
            <p className="mt-1 text-xs text-muted-foreground">
              没有冷却或停用中的账号
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PolicyItem({
  icon,
  label,
  value,
  loading,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  loading: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-4 w-20" />
        ) : (
          <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
        )}
      </div>
    </div>
  )
}

function ServiceInfoCard({
  data,
  loading,
}: {
  data?: AppState
  loading: boolean
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="size-4 text-primary" />
          服务信息
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <PolicyItem
          icon={<Shield className="size-4" />}
          label="版本"
          value={data?.version || "-"}
          loading={loading}
        />
        <PolicyItem
          icon={<Radio className="size-4" />}
          label="监听"
          value={`${data?.listen_host ?? "-"}:${data?.listen_port ?? "-"}`}
          loading={loading}
        />
        <PolicyItem
          icon={<Clock className="size-4" />}
          label="签到时间"
          value={(data?.checkin_times ?? []).join(" / ") || "-"}
          loading={loading}
        />
        <PolicyItem
          icon={<Activity className="size-4" />}
          label="Token 保活"
          value={
            (data?.keepalive_hours ?? [])
              .map((h) => `${String(h).padStart(2, "0")}:00`)
              .join(" / ") || "-"
          }
          loading={loading}
        />
      </CardContent>
    </Card>
  )
}

function QuickActionsCard() {
  const navigate = useNavigate()

  const actions = [
    {
      label: "管理账号池",
      icon: <Pencil className="size-4" />,
      onClick: () => navigate("/admin/token"),
    },
    {
      label: "添加账号",
      icon: <CheckCircle2 className="size-4" />,
      onClick: () => navigate("/admin/token"),
    },
    {
      label: "API 接入信息",
      icon: <Key className="size-4" />,
      onClick: () => navigate("/admin/keys"),
    },
    {
      label: "查看运行日志",
      icon: <ArrowRight className="size-4" />,
      onClick: () => navigate("/admin/logs"),
    },
  ]

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ArrowRight className="size-4 text-primary" />
          快捷操作
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            className="h-9 justify-start text-xs"
            onClick={action.onClick}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}

function EndpointCard({ data }: { data?: AppState }) {
  const baseUrl = `${window.location.origin}/v1`
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-success-muted/35 text-success">
            <Coins className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">OpenAI 兼容端点</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {baseUrl}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-success-muted/30 px-3 py-2 text-success">
            <CheckCircle2 className="mb-1 size-4" />
            {data?.accounts.length ?? 0} 个账号在池
          </div>
          <div className="rounded-lg bg-primary/10 px-3 py-2 text-primary">
            <Key className="mb-1 size-4" />
            Bearer 鉴权
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data, loading, error } = usePolling<AppState>(api.getState, 5000)

  const accounts = data?.accounts ?? []
  const available = accounts.filter((a) => !a.disabled && !a.cooling).length
  const unhealthy = accounts.filter((a) => a.disabled || a.cooling).length
  const credits = accounts.reduce((sum, a) => sum + a.credits, 0)
  const channels = new Set(accounts.map((a) => a.group)).size

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          加载失败：{error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Shield className="size-4" />}
          title="账号池"
          value={
            data ? (
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate">
                  {accounts.length > 0 ? `${available}/${accounts.length} 可用` : "0"}
                </span>
                <Badge
                  variant={unhealthy === 0 ? "default" : "destructive"}
                  className="text-[10px]"
                >
                  {unhealthy === 0 ? "正常" : "异常"}
                </Badge>
              </div>
            ) : (
              "-"
            )
          }
          detail={
            data
              ? `冷却 ${accounts.filter((a) => a.cooling).length} · 停用 ${accounts.filter((a) => a.disabled).length}`
              : undefined
          }
          loading={loading}
        />
        <StatCard
          icon={<Coins className="size-4" />}
          title="总积分"
          value={credits.toLocaleString()}
          detail="账号池全部账号余额合计"
          loading={loading}
        />
        <StatCard
          icon={<Activity className="size-4" />}
          title="启用渠道"
          value={`${channels}/3`}
          detail="WorkBuddy · TraeWork · Qoder"
          loading={loading}
        />
        <StatCard
          icon={<Clock className="size-4" />}
          title="下次签到"
          value={data?.next_checkin || "-"}
          detail={`签到时间 ${(data?.checkin_times ?? []).join(" / ")}`}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <PoolOverviewCard data={data ?? undefined} loading={loading} />
          <AttentionAccountsCard data={data ?? undefined} loading={loading} />
        </div>

        <div className="space-y-5">
          <ServiceInfoCard data={data ?? undefined} loading={loading} />
          <QuickActionsCard />
          <EndpointCard data={data ?? undefined} />
        </div>
      </div>
    </div>
  )
}
