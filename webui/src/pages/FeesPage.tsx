import * as React from "react";
import useSWR from "swr";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, CHANNEL_LABEL, fetcher, type FeesInfo } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";

export default function FeesPage() {
  const { data: fees, isLoading, mutate } = useSWR<FeesInfo>(
    "/api/fees",
    fetcher,
  );
  const [refreshing, setRefreshing] = React.useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await api("/api/fees/refresh", {});
      await mutate();
      toast.success("费率已刷新");
    } catch (err) {
      toast.error(`刷新失败：${err instanceof Error ? err.message : err}`);
    } finally {
      setRefreshing(false);
    }
  }

  if (isLoading || !fees) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const busy = refreshing;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">渠道费率</h1>
          <p className="text-sm text-muted-foreground">
            {fees.note} 缓存于 {fees.cached_at || "—"}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
          {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          刷新费率
        </Button>
      </div>

      {fees.error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {fees.error}
          </CardContent>
        </Card>
      )}

      {fees.channels.length === 0 && !fees.error && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            暂无费率数据 — 添加账号后可从上游拉取
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {fees.channels.map(({ channel, models }) => (
          <Card key={channel}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {CHANNEL_LABEL[channel]}
                <Badge variant="secondary">{models.length} 模型</Badge>
              </CardTitle>
              <CardDescription>
                模型 ID 需带前缀 <code className="font-mono">{channel}/</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{fees.disclaimer}</p>
    </div>
  );
}
