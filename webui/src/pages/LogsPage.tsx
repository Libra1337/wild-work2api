import * as React from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { fetcher } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export default function LogsPage() {
  const { data, isLoading, mutate } = useSWR<{ lines: string[] }>(
    "/api/logs",
    fetcher,
    { refreshInterval: 10000 },
  );
  const [autoScroll, setAutoScroll] = React.useState(true);
  const preRef = React.useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    if (autoScroll && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [data, autoScroll]);

  const lines = (data?.lines ?? []).filter((l) => l.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">运行日志</h1>
          <p className="text-sm text-muted-foreground">
            最近 {lines.length} 行 · 每 10 秒自动刷新
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            自动滚动
          </label>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RefreshCw />
            刷新
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <pre
              ref={preRef}
              className="max-h-[70vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed"
            >
              {lines.length === 0 ? "（暂无日志）" : lines.join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
