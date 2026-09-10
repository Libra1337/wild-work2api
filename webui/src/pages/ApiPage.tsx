import { useState } from "react"
import {
  CalendarClock,
  CircleDollarSign,
  Eye,
  EyeOff,
  Key,
  Link2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"

import { usePolling } from "@/hooks/use-polling"
import { api } from "@/lib/api-client"
import type { AppState, FeesInfo } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { CopyButton } from "@/components/shared/CopyButton"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

const CHANNEL_LABEL: Record<string, string> = {
  workbuddy: "WorkBuddy",
  traework: "TraeWork",
  qoder: "Qoder",
}

function maskKey(key: string) {
  if (key.length <= 10) return key
  return `${key.slice(0, 6)}${"•".repeat(12)}${key.slice(-4)}`
}

function ApiKeyChangeDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const key = draft.trim()
    if (!key) {
      setError("API Key 不能为空")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.configApiKey(key)
      setDraft("")
      setOpen(false)
      onDone()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-10 w-full sm:h-7 sm:w-auto" />
        }
      >
        <Key className="mr-1.5 h-3.5 w-3.5" />
        修改 Key
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>修改 API Key</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <label className="text-xs text-muted-foreground">
              新的 API Key（客户端通过 Authorization: Bearer 访问）
            </label>
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="sk-..."
              className="h-10 font-mono md:h-8"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button onClick={handleSave} disabled={saving || !draft.trim()}>
            {saving ? <LoadingSpinner size={16} className="mr-2" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ApiPage() {
  const { data, loading, error, refresh } = usePolling<AppState>(
    api.getState,
    10000,
  )
  const { data: fees } = usePolling<FeesInfo>(api.fees, 300000)
  const [showKey, setShowKey] = useState(false)
  const [timesDraft, setTimesDraft] = useState<string | null>(null)
  const [savingTimes, setSavingTimes] = useState(false)
  const [feesRefreshing, setFeesRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeError, setNoticeError] = useState<string | null>(null)

  const baseUrl = `${window.location.origin}/v1`
  const times = timesDraft ?? (data?.checkin_times ?? []).join(", ")

  const saveTimes = async () => {
    const parsed = timesDraft
      ?.split(/[，,]/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (!parsed || parsed.length === 0) {
      setNoticeError("请至少填写一个时间点，如 09:00")
      return
    }
    if (!parsed.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
      setNoticeError("时间格式应为 HH:MM，如 09:00")
      return
    }
    setSavingTimes(true)
    setNoticeError(null)
    try {
      await api.configCheckinTimes(parsed)
      setTimesDraft(null)
      setNotice("签到时间已更新")
      await refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败"
      setNoticeError(msg)
    } finally {
      setSavingTimes(false)
    }
  }

  const refreshFees = async () => {
    setFeesRefreshing(true)
    try {
      await api.feesRefresh()
      setNotice("费率已刷新")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "刷新失败"
      setNoticeError(msg)
    } finally {
      setFeesRefreshing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>加载失败：{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {noticeError && (
        <Alert variant="destructive">
          <AlertDescription>{noticeError}</AlertDescription>
        </Alert>
      )}

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="size-4 text-primary" />
            OpenAI 兼容端点
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/25 p-2">
                <code className="min-w-0 flex-1 truncate px-1 font-mono text-xs">
                  {baseUrl}
                </code>
                <CopyButton text={baseUrl} />
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/25 p-2">
                <code className="min-w-0 flex-1 truncate px-1 font-mono text-xs">
                  {showKey ? data?.api_key : maskKey(data?.api_key ?? "")}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "隐藏 Key" : "显示 Key"}
                >
                  {showKey ? <EyeOff /> : <Eye />}
                </Button>
                <CopyButton text={data?.api_key ?? ""} />
                <ApiKeyChangeDialog onDone={() => void refresh()} />
              </div>
              <p className="text-xs text-muted-foreground">
                模型 ID 需带渠道前缀：workbuddy/、traework/、qoder/
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4 text-primary" />
            自动签到
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            value={times}
            onChange={(event) => setTimesDraft(event.target.value)}
            className="max-w-64 font-mono"
            placeholder="09:00, 21:00"
          />
          <Button
            size="sm"
            disabled={savingTimes || timesDraft === null}
            onClick={() => void saveTimes()}
          >
            {savingTimes ? <LoadingSpinner size={14} className="mr-1.5" /> : null}
            保存
          </Button>
          <span className="text-xs text-muted-foreground">
            Token 保活：
            {(data?.keepalive_hours ?? [])
              .map((h) => `${String(h).padStart(2, "0")}:00`)
              .join(" / ")}
          </span>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CircleDollarSign className="size-4 text-primary" />
              渠道费率
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={feesRefreshing}
              onClick={() => void refreshFees()}
            >
              {feesRefreshing ? (
                <LoaderCircle className="mr-1.5 size-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3" />
              )}
              刷新费率
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fees?.error && (
            <Alert variant="destructive">
              <AlertDescription>{fees.error}</AlertDescription>
            </Alert>
          )}
          {fees && fees.channels.length > 0 ? (
            fees.channels.map(({ channel, models }) => (
              <div key={channel} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">
                    {CHANNEL_LABEL[channel] ?? channel}
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {models.length} 模型
                  </Badge>
                  <code className="text-xs text-muted-foreground">
                    {channel}/
                  </code>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>模型</TableHead>
                      <TableHead>费率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models.map((m) => (
                      <TableRow key={m.model}>
                        <TableCell className="font-mono text-xs">
                          {m.model}
                          {m.note && (
                            <span className="ml-1 text-muted-foreground">
                              {m.note}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {m.rate}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              暂无费率数据 — 添加账号后可从上游拉取
            </div>
          )}
          {fees && (
            <p className="text-xs text-muted-foreground">
              {fees.note} 缓存于 {fees.cached_at || "—"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
