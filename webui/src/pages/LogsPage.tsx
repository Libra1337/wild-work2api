import { useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"

import { usePolling } from "@/hooks/use-polling"
import { api } from "@/lib/api-client"
import type { LogsData } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function LogsPage() {
  const { data, loading, error, refresh } = usePolling<LogsData>(api.logs, 10000)
  const [autoScroll, setAutoScroll] = useState(true)
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (autoScroll && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [data, autoScroll])

  const lines = (data?.lines ?? []).filter((l) => l.length > 0)

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          加载失败：{error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">最近 {lines.length} 行</p>
          <p className="text-xs text-muted-foreground">每 10 秒自动刷新</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(event) => setAutoScroll(event.target.checked)}
              className="size-4 accent-primary"
            />
            自动滚动
          </label>
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
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-0">
            <pre
              ref={preRef}
              className="max-h-[70vh] overflow-auto rounded-lg bg-muted/60 p-4 font-mono text-xs leading-relaxed"
            >
              {lines.length === 0 ? "（暂无日志）" : lines.join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
