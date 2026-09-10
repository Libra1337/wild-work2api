import { useState, useEffect, useCallback, useRef } from "react"
import {
  CalendarCheck2,
  CheckCircle2,
  ExternalLink,
  FileJson,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Coins,
  Trash2,
} from "lucide-react"

import { api } from "@/lib/api-client"
import type { AppState, ImportResult, ResourceDetail } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { LoadingSpinner } from "@/components/shared/LoadingSpinner"
import { PaginationControls } from "@/components/shared/PaginationControls"
import { Skeleton } from "@/components/ui/skeleton"

const ACCOUNTS_PAGE_SIZE = 5

const CHANNEL_LABEL: Record<string, string> = {
  workbuddy: "WorkBuddy",
  traework: "TraeWork",
  qoder: "Qoder",
}

const CHANNEL_DESC: Record<string, string> = {
  workbuddy: "腾讯 CodeBuddy / WorkBuddy",
  traework: "字节 TraeWork",
  qoder: "阿里 Qoder",
}

function metric(label: string, value: string | number) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function AccountDetail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | number
  mono?: boolean
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/35 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`mt-1 truncate font-medium ${
          mono ? "font-mono text-xs" : "text-sm"
        }`}
        title={String(value)}
      >
        {value}
      </p>
    </div>
  )
}

type LoginStage =
  | { phase: "pick" }
  | { phase: "waiting"; channel: string; authUrl: string }

function AddAccountDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<LoginStage>({ phase: "pick" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef = useRef(0)

  const stopPolling = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  useEffect(() => stopPolling, [])

  const reset = () => {
    stopPolling()
    setStage({ phase: "pick" })
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (stage.phase === "waiting") {
        stopPolling()
        void api.loginCancel().catch(() => {})
      }
      reset()
    }
    setOpen(next)
  }

  const start = async (channel: string) => {
    setBusy(true)
    setError(null)
    try {
      const before = await api.getState()
      countRef.current = before.accounts.length
      const r = await api.loginStart(channel)
      setStage({ phase: "waiting", channel, authUrl: r.auth_url })
      window.open(r.auth_url, "_blank", "noopener")
      stopPolling()
      timerRef.current = setInterval(async () => {
        try {
          const st = await api.getState()
          if (!st.login_busy) {
            stopPolling()
            const added = st.accounts.length > countRef.current
            if (added) {
              handleOpenChange(false)
              onDone()
            } else {
              setStage({ phase: "pick" })
              setError("未检测到新账号，可能登录未完成，请重试")
            }
          }
        } catch {
          /* 轮询失败静默重试 */
        }
      }, 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "发起登录失败"
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-10 w-full sm:h-7 sm:w-auto" />
        }
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        OAuth 登录添加
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stage.phase === "waiting"
              ? `登录 ${CHANNEL_LABEL[stage.channel]}`
              : "添加账号"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {stage.phase === "pick" ? (
            <div className="grid gap-2">
              {["workbuddy", "traework", "qoder"].map((ch) => (
                <Button
                  key={ch}
                  variant="outline"
                  disabled={busy}
                  className="h-auto justify-between px-4 py-3"
                  onClick={() => void start(ch)}
                >
                  <span className="flex flex-col items-start">
                    <span className="text-sm font-medium">
                      {CHANNEL_LABEL[ch]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {CHANNEL_DESC[ch]}
                    </span>
                  </span>
                  <ExternalLink className="size-4 text-muted-foreground" />
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin text-primary" />
                已打开授权页面，等待登录完成…
              </div>
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted p-2">
                <code className="min-w-0 flex-1 truncate px-1 font-mono text-xs">
                  {stage.authUrl}
                </code>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() =>
                    window.open(stage.authUrl, "_blank", "noopener")
                  }
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  重新打开授权页
                </Button>
                <DialogClose
                  render={
                    <Button
                      variant="ghost"
                      onClick={() => handleOpenChange(false)}
                    />
                  }
                >
                  取消
                </DialogClose>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleSave = async () => {
    if (!raw.trim()) return
    setSaving(true)
    setError(null)
    try {
      const r = await api.accountImport(raw.trim())
      if (!r.ok) throw new Error(r.error || "导入失败")
      setResult(r)
      setRaw("")
      onDone()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "导入失败"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setError(null)
      setResult(null)
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-10 w-full sm:h-7 sm:w-auto" />
        }
      >
        <FileJson className="mr-1.5 h-3.5 w-3.5" />
        导入 JSON
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入账号凭证</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {result && result.ok && (
            <Alert>
              <AlertDescription>
                已导入 {result.nickname || result.uid?.slice(0, 8)}
                （可继续粘贴下一个）
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <label className="text-xs text-muted-foreground">
              粘贴 workbuddy-desktop 导出的 JSON（支持整个文件内容）
            </label>
            <Textarea
              placeholder='{"account": {"uid": "..."}, "auth": {"accessToken": "..."}}'
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>关闭</DialogClose>
          <Button onClick={handleSave} disabled={saving || !raw.trim()}>
            {saving ? <LoadingSpinner size={16} className="mr-2" /> : null}
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AppState["accounts"]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyAccount, setBusyAccount] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    account: string
    raw: string
  } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    try {
      const st = await api.getState()
      setAccounts(st.accounts)
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载账号池失败"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  const runAction = async (
    uid: string,
    fn: () => Promise<{ msg?: string }>,
    okMsg: string,
  ) => {
    setBusyAccount(uid)
    setActionError(null)
    setActionSuccess(null)
    try {
      const r = await fn()
      setActionSuccess(r.msg || okMsg)
      await load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失败"
      setActionError(msg)
    } finally {
      setBusyAccount(null)
    }
  }

  const showDetail = async (uid: string, name: string) => {
    setDetail({ account: name, raw: "加载中…" })
    setDetailLoading(true)
    try {
      const r: ResourceDetail = await api.accountResourceDetail(uid)
      setDetail({ account: name, raw: JSON.stringify(r, null, 2) })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败"
      setDetail({ account: name, raw: `加载失败：${msg}` })
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDelete = async (uid: string, name: string) => {
    if (!window.confirm(`确定删除账号 ${name}？该操作不可恢复。`)) return
    await runAction(uid, () => api.accountRemove(uid), "已删除")
  }

  const total = accounts.length
  const available = accounts.filter((a) => !a.disabled && !a.cooling).length
  const cooling = accounts.filter((a) => a.cooling).length
  const disabled = accounts.filter((a) => a.disabled).length
  const credits = accounts.reduce((sum, a) => sum + a.credits, 0)

  const pageCount = Math.max(Math.ceil(total / ACCOUNTS_PAGE_SIZE), 1)
  const current = Math.min(Math.max(page, 1), pageCount)
  const startOffset = (current - 1) * ACCOUNTS_PAGE_SIZE
  const paginated = accounts.slice(startOffset, startOffset + ACCOUNTS_PAGE_SIZE)
  const startIndex = total === 0 ? 0 : startOffset + 1
  const endIndex = Math.min(startOffset + ACCOUNTS_PAGE_SIZE, total)

  useEffect(() => {
    setPage((p) => Math.min(Math.max(p, 1), pageCount))
  }, [pageCount])

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium">账号池</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AddAccountDialog onDone={load} />
              <ImportDialog onDone={load} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {metric("总账号", total)}
                {metric("可用", available)}
                {metric("冷却中", cooling)}
                {metric("已停用", disabled)}
                {metric("总积分", credits.toLocaleString())}
              </div>

              {actionSuccess && (
                <Alert>
                  <AlertDescription>{actionSuccess}</AlertDescription>
                </Alert>
              )}
              {actionError && (
                <Alert variant="destructive">
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3">
                {total === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    暂无账号 — 点击「OAuth 登录添加」或「导入 JSON」开始
                  </div>
                ) : (
                  paginated.map((account) => (
                    <div
                      key={account.uid}
                      className="rounded-lg border border-border/60 bg-card p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate text-sm font-semibold">
                              {account.nickname || "未命名"}
                            </h3>
                            <Badge variant="secondary" className="text-[10px]">
                              {CHANNEL_LABEL[account.group] ?? account.group}
                            </Badge>
                            {account.disabled ? (
                              <Badge variant="destructive" className="text-[10px]">
                                已停用
                              </Badge>
                            ) : account.cooling ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-warning"
                              >
                                冷却至 {account.until || "-"}
                              </Badge>
                            ) : (
                              <Badge className="text-[10px]">可用</Badge>
                            )}
                            {account.err_count > 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                连续失败 {account.err_count}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                          <AccountDetail
                            label="积分"
                            value={account.credits.toLocaleString()}
                          />
                          <AccountDetail label="UID" value={account.uid.slice(0, 8)} mono />
                          <AccountDetail
                            label="上次签到"
                            value={account.last_checkin_at || "-"}
                          />
                          <AccountDetail
                            label="签到结果"
                            value={
                              account.last_checkin_at
                                ? account.last_checkin_ok
                                  ? "成功"
                                  : account.last_checkin_msg || "失败"
                                : "-"
                            }
                          />
                          <AccountDetail
                            label="状态说明"
                            value={
                              account.disabled
                                ? "手动停用"
                                : account.reason || "正常"
                            }
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3 sm:flex sm:flex-wrap sm:justify-end lg:grid-cols-5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void runAction(
                                account.uid,
                                () => api.accountCheckin(account.uid),
                                "签到成功",
                              )
                            }
                            disabled={busyAccount === account.uid}
                            className="h-10 w-full whitespace-nowrap sm:h-7 sm:w-auto"
                          >
                            {busyAccount === account.uid ? (
                              <LoadingSpinner size={14} className="mr-1.5" />
                            ) : (
                              <CalendarCheck2 className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            签到
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void runAction(
                                account.uid,
                                () => api.accountRefresh(account.uid),
                                "已刷新",
                              )
                            }
                            disabled={busyAccount === account.uid}
                            className="h-10 w-full whitespace-nowrap sm:h-7 sm:w-auto"
                          >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            刷新积分
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void showDetail(
                                account.uid,
                                account.nickname || account.uid.slice(0, 8),
                              )
                            }
                            disabled={detailLoading}
                            className="h-10 w-full whitespace-nowrap sm:h-7 sm:w-auto"
                          >
                            <Coins className="mr-1.5 h-3.5 w-3.5" />
                            积分明细
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void runAction(
                                account.uid,
                                () =>
                                  api.accountDisable(account.uid, !account.disabled),
                                account.disabled ? "已启用" : "已停用",
                              )
                            }
                            disabled={busyAccount === account.uid}
                            className="h-10 w-full whitespace-nowrap sm:h-7 sm:w-auto"
                          >
                            {account.disabled ? (
                              <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                            ) : (
                              <PauseCircle className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {account.disabled ? "启用" : "停用"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void handleDelete(
                                account.uid,
                                account.nickname || account.uid.slice(0, 8),
                              )
                            }
                            disabled={busyAccount === account.uid}
                            className="h-10 w-full whitespace-nowrap text-destructive hover:text-destructive sm:h-7 sm:w-auto"
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {total > 0 && (
                <PaginationControls
                  page={current}
                  pageCount={pageCount}
                  total={total}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {detail && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4" />
              积分明细 · {detail.account}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted/60 p-3 text-xs">
              {detail.raw}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
