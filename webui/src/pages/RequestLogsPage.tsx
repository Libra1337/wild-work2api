import { RefreshCw } from "lucide-react"

import { usePolling } from "@/hooks/use-polling"
import { api } from "@/lib/api-client"
import type { ReqLog } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const CHANNEL_LABEL: Record<string, string> = {
  workbuddy: "WorkBuddy",
  traework: "TraeWork",
  qoder: "Qoder",
}

function fmtMs(ms: number): string {
  if (ms <= 0) return "-"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtNum(n: number): string {
  if (n === 0) return "0"
  return n.toLocaleString()
}

export default function RequestLogsPage() {
  const { data, loading, refresh } = usePolling<{ logs: ReqLog[] }>(
    api.requestLogs,
    10000,
  )
  const logs = data?.logs ?? []

  const totals = logs.reduce(
    (acc, l) => ({
      in: acc.in + l.in_tokens,
      out: acc.out + l.out_tokens,
      credit: acc.credit + l.credit,
    }),
    { in: 0, out: 0, credit: 0 },
  )

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            最近 {logs.length} 次调用 · 每 10 秒自动刷新
          </p>
          <p className="text-xs text-muted-foreground">
            累计输入 {fmtNum(totals.in)} tok · 输出 {fmtNum(totals.out)} tok
            · 消耗积分 {totals.credit.toFixed(2)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => void refresh()}
        >
          <RefreshCw className="mr-1.5 size-3" />
          刷新
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            暂无调用记录 — 通过 /v1/chat/completions 或 /v1/responses 发起请求后显示
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>渠道</TableHead>
                  <TableHead>账号</TableHead>
                  <TableHead className="text-right">首字</TableHead>
                  <TableHead className="text-right">耗时</TableHead>
                  <TableHead className="text-right">输入</TableHead>
                  <TableHead className="text-right">输出</TableHead>
                  <TableHead className="text-right">缓存</TableHead>
                  <TableHead className="text-right">积分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {l.time}
                    </TableCell>
                    <TableCell className="max-w-40 truncate font-mono text-xs">
                      {l.model}
                      {l.stream && (
                        <Badge variant="secondary" className="ml-1 text-[9px]">
                          流式
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {CHANNEL_LABEL[l.channel] ?? l.channel}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {l.uid ? l.uid.slice(0, 8) : "-"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono text-xs",
                        l.ttfb_ms > 3000 && "text-warning",
                      )}
                    >
                      {fmtMs(l.ttfb_ms)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtMs(l.total_ms)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtNum(l.in_tokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtNum(l.out_tokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {fmtNum(l.cached_tokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {l.credit > 0 ? l.credit.toFixed(2) : "0"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
