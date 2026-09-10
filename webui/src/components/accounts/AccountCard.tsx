import * as React from "react";
import { useSWRConfig } from "swr";
import {
  BadgeCheck,
  CalendarCheck2,
  Coins,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Snowflake,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { api, CHANNEL_LABEL, type AccountView, type Channel } from "../../lib/api";
import { formatCredits } from "../../lib/utils";

const CHANNEL_VARIANT: Record<Channel, "info" | "warning" | "success"> = {
  workbuddy: "success",
  traework: "warning",
  qoder: "info",
};

interface AccountCardProps {
  account: AccountView;
  onRemove: (account: AccountView) => void;
}

export function AccountCard({ account, onRemove }: AccountCardProps) {
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<string>("");

  async function run(
    action: string,
    path: string,
    body: Record<string, unknown>,
    okMsg: (r: { msg?: string }) => string,
  ) {
    setBusy(action);
    try {
      const r = await api<{ msg?: string }>(path, body);
      toast.success(okMsg(r));
      await mutate("/api/state");
    } catch (err) {
      toast.error(`操作失败：${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(null);
    }
  }

  async function showDetail() {
    setDetailOpen(true);
    setDetail("加载中…");
    try {
      const r = await api<Record<string, unknown>>("/api/account/resource_detail", {
        uid: account.uid,
      });
      setDetail(JSON.stringify(r, null, 2));
    } catch (err) {
      setDetail(`加载失败：${err instanceof Error ? err.message : err}`);
    }
  }

  const initial = (account.nickname || account.uid).slice(0, 1).toUpperCase();

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-semibold text-secondary-foreground"
            aria-hidden="true"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {account.nickname || "未命名"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {account.uid.slice(0, 8)}
            </p>
          </div>
        </div>
        <Badge variant={CHANNEL_VARIANT[account.group]}>
          {CHANNEL_LABEL[account.group]}
        </Badge>
      </CardHeader>

      <CardContent className="flex-1 space-y-2 pb-3">
        <button
          type="button"
          onClick={showDetail}
          className="flex items-baseline gap-1.5 rounded-md text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="点击查看积分明细"
        >
          <Coins className="size-4 self-center text-muted-foreground" aria-hidden="true" />
          <span className="font-mono text-2xl font-semibold tracking-tight">
            {formatCredits(account.credits)}
          </span>
          <span className="text-xs text-muted-foreground">积分</span>
        </button>

        <div className="flex flex-wrap gap-1.5">
          {account.disabled && <Badge variant="destructive">已停用</Badge>}
          {account.cooling && (
            <Badge variant="warning">
              <Snowflake aria-hidden="true" />
              冷却中{account.until ? ` · ${account.until}` : ""}
            </Badge>
          )}
          {!account.disabled && !account.cooling && (
            <Badge variant="secondary">
              <BadgeCheck aria-hidden="true" />
              可用
            </Badge>
          )}
          {account.err_count > 0 && (
            <Badge variant="outline">连续失败 {account.err_count}</Badge>
          )}
          {account.reason && !account.cooling && (
            <Badge variant="outline">{account.reason}</Badge>
          )}
        </div>

        {account.last_checkin_at && (
          <p className="text-xs text-muted-foreground">
            上次签到 {account.last_checkin_at}
            {account.last_checkin_msg ? ` · ${account.last_checkin_msg}` : ""}
          </p>
        )}
      </CardContent>

      <CardFooter className="gap-1.5 border-t border-border !py-2.5">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy !== null}
          onClick={() =>
            run("checkin", "/api/account/checkin", { uid: account.uid }, (r) => r.msg || "签到成功")
          }
          aria-label="签到"
          title="签到"
        >
          {busy === "checkin" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <CalendarCheck2 />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy !== null}
          onClick={() =>
            run("refresh", "/api/account/refresh", { uid: account.uid }, () => "已刷新")
          }
          aria-label="刷新积分"
          title="刷新积分"
        >
          {busy === "refresh" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy !== null}
          onClick={() =>
            run(
              "disable",
              "/api/account/disable",
              { uid: account.uid, disabled: !account.disabled },
              () => (account.disabled ? "已启用" : "已停用"),
            )
          }
          aria-label={account.disabled ? "启用" : "停用"}
          title={account.disabled ? "启用" : "停用"}
        >
          {busy === "disable" ? (
            <LoaderCircle className="animate-spin" />
          ) : account.disabled ? (
            <PlayCircle />
          ) : (
            <PauseCircle />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto text-destructive hover:text-destructive"
          disabled={busy !== null}
          onClick={() => onRemove(account)}
          aria-label="删除账号"
          title="删除账号"
        >
          <Trash2 />
        </Button>
      </CardFooter>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>积分明细</DialogTitle>
            <DialogDescription>
              {account.nickname || account.uid.slice(0, 8)} · {CHANNEL_LABEL[account.group]}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-xs leading-relaxed">
            {detail}
          </pre>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
