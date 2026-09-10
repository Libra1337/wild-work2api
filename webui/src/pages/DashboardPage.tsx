import * as React from "react";
import useSWR from "swr";
import { CalendarCheck2, LoaderCircle, Plus, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { api, CHANNELS, CHANNEL_LABEL, fetcher, type AccountView, type AppState, type Channel } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { StatCards } from "../components/accounts/StatCards";
import { AccountCard } from "../components/accounts/AccountCard";
import { AddAccountDialog } from "../components/accounts/AddAccountDialog";

function ChannelSection({
  channel,
  accounts,
  onAdd,
  onRemove,
}: {
  channel: Channel;
  accounts: AccountView[];
  onAdd: (channel: Channel) => void;
  onRemove: (account: AccountView) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <section aria-label={`${CHANNEL_LABEL[channel]} 账号`} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Users className="size-4" aria-hidden="true" />
          {CHANNEL_LABEL[channel]}
          <span className="font-mono text-xs">({accounts.length})</span>
        </h2>
        <Button variant="outline" size="sm" onClick={() => onAdd(channel)}>
          <Plus />
          添加
        </Button>
      </div>
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard key={account.uid} account={account} onRemove={onRemove} />
        ))}
      </div>
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
          <Users className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">还没有账号</p>
          <p className="text-sm text-muted-foreground">
            添加 WorkBuddy / TraeWork / Qoder 账号后，网关开始对外提供服务
          </p>
        </div>
        <Button onClick={onAdd}>
          <Plus />
          添加账号
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: state, isLoading, mutate } = useSWR<AppState>("/api/state", fetcher, {
    refreshInterval: 5000,
  });
  const [addOpen, setAddOpen] = React.useState(false);
  const [addChannel, setAddChannel] = React.useState<Channel | undefined>();
  const [bulkBusy, setBulkBusy] = React.useState(false);

  function openAdd(channel?: Channel) {
    setAddChannel(channel);
    setAddOpen(true);
  }

  async function bulk(path: string, label: string) {
    setBulkBusy(true);
    try {
      await api(path, {});
      toast.success(`${label}已触发`);
      await mutate();
    } catch (err) {
      toast.error(`${label}失败：${err instanceof Error ? err.message : err}`);
    } finally {
      setBulkBusy(false);
    }
  }

  async function removeAccount(account: AccountView) {
    const name = account.nickname || account.uid.slice(0, 8);
    if (!window.confirm(`确定删除账号 ${name}？该操作不可恢复。`)) return;
    try {
      await api("/api/account/remove", { uid: account.uid });
      toast.success(`已删除 ${name}`);
      await mutate();
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : err}`);
    }
  }

  if (isLoading || !state) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const hasAccounts = state.accounts.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatCards state={state} />
        {hasAccounts && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy}
              onClick={() => void bulk("/api/account/checkin_all", "全部签到")}
            >
              {bulkBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CalendarCheck2 />
              )}
              全部签到
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy}
              onClick={() => void bulk("/api/account/refresh_all", "全部刷新")}
            >
              {bulkBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              全部刷新
            </Button>
            <Button size="sm" onClick={() => openAdd()}>
              <Plus />
              添加账号
            </Button>
          </div>
        )}
      </div>

      {!hasAccounts ? (
        <EmptyState onAdd={() => openAdd()} />
      ) : (
        CHANNELS.map((ch) => (
          <ChannelSection
            key={ch}
            channel={ch}
            accounts={state.accounts.filter((a) => a.group === ch)}
            onAdd={openAdd}
            onRemove={removeAccount}
          />
        ))
      )}

      <AddAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultChannel={addChannel}
      />
    </div>
  );
}
