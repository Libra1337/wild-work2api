import * as React from "react";
import useSWR from "swr";
import { Eye, EyeOff, KeyRound, LoaderCircle, Link2 } from "lucide-react";
import { toast } from "sonner";
import { api, fetcher, type AppState } from "../lib/api";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { CopyButton } from "../components/shared/CopyButton";
import { Skeleton } from "../components/ui/skeleton";

function maskKey(key: string) {
  if (key.length <= 10) return key;
  return `${key.slice(0, 6)}${"•".repeat(12)}${key.slice(-4)}`;
}

export default function SettingsPage() {
  const { data: state, mutate } = useSWR<AppState>("/api/state", fetcher);
  const [showKey, setShowKey] = React.useState(false);
  const [keyEditing, setKeyEditing] = React.useState(false);
  const [keyDraft, setKeyDraft] = React.useState("");
  const [savingKey, setSavingKey] = React.useState(false);
  const [timesDraft, setTimesDraft] = React.useState<string | null>(null);
  const [savingTimes, setSavingTimes] = React.useState(false);

  if (!state) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const baseUrl = `${window.location.origin}/v1`;
  const times = timesDraft ?? state.checkin_times.join(", ");

  async function saveKey() {
    const key = keyDraft.trim();
    if (!key) {
      toast.error("API Key 不能为空");
      return;
    }
    setSavingKey(true);
    try {
      await api("/api/config/api_key", { key });
      toast.success("API Key 已更新");
      setKeyEditing(false);
      setKeyDraft("");
      await mutate();
    } catch (err) {
      toast.error(`保存失败：${err instanceof Error ? err.message : err}`);
    } finally {
      setSavingKey(false);
    }
  }

  async function saveTimes() {
    const parsed = timesDraft
      ?.split(/[，,]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parsed || parsed.length === 0) {
      toast.error("请至少填写一个时间点，如 09:00");
      return;
    }
    if (!parsed.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
      toast.error("时间格式应为 HH:MM，如 09:00");
      return;
    }
    setSavingTimes(true);
    try {
      await api("/api/config/checkin_times", { times: parsed });
      toast.success("签到时间已更新");
      setTimesDraft(null);
      await mutate();
    } catch (err) {
      toast.error(`保存失败：${err instanceof Error ? err.message : err}`);
    } finally {
      setSavingTimes(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">设置</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-4" aria-hidden="true" />
            API 接入
          </CardTitle>
          <CardDescription>
            OpenAI 兼容端点，模型 ID 需带渠道前缀（如 workbuddy/deepseek-v4-flash）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted p-2">
            <code className="min-w-0 flex-1 truncate px-1 font-mono text-xs">
              {baseUrl}
            </code>
            <CopyButton value={baseUrl} label="Base URL" />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted p-2">
            <code className="min-w-0 flex-1 truncate px-1 font-mono text-xs">
              {showKey ? state.api_key : maskKey(state.api_key)}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "隐藏 Key" : "显示 Key"}
            >
              {showKey ? <EyeOff /> : <Eye />}
            </Button>
            <CopyButton value={state.api_key} label="API Key" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" aria-hidden="true" />
            API Key
          </CardTitle>
          <CardDescription>
            客户端通过 Authorization: Bearer 访问 /v1 端点
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keyEditing ? (
            <div className="flex gap-2">
              <Input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="输入新的 API Key"
                className="font-mono"
                autoFocus
              />
              <Button disabled={savingKey} onClick={() => void saveKey()}>
                {savingKey && <LoaderCircle className="animate-spin" />}
                保存
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setKeyEditing(false);
                  setKeyDraft("");
                }}
              >
                取消
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setKeyEditing(true)}>
              修改 API Key
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">自动签到</CardTitle>
          <CardDescription>
            每日定时签到领额度（服务器本地时区），逗号分隔多个时间点
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            value={times}
            onChange={(e) => setTimesDraft(e.target.value)}
            className="max-w-64 font-mono"
            placeholder="09:00, 21:00"
          />
          <Button
            disabled={savingTimes || timesDraft === null}
            onClick={() => void saveTimes()}
          >
            {savingTimes && <LoaderCircle className="animate-spin" />}
            保存
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">服务信息</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">版本</dt>
              <dd className="font-mono">{state.version || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">监听地址</dt>
              <dd className="font-mono">
                {state.listen_host}:{state.listen_port}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Token 保活</dt>
              <dd className="font-mono">
                {state.keepalive_hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(" / ")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
