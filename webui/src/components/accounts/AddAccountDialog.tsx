import * as React from "react";
import { useSWRConfig } from "swr";
import {
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { CopyButton } from "../shared/CopyButton";
import {
  api,
  CHANNELS,
  CHANNEL_LABEL,
  type AppState,
  type Channel,
} from "../../lib/api";

type Stage =
  | { phase: "pick" }
  | { phase: "waiting"; channel: Channel; authUrl: string }
  | { phase: "done"; channel: Channel; added: boolean };

const CHANNEL_DESC: Record<Channel, string> = {
  workbuddy: "腾讯 CodeBuddy / WorkBuddy",
  traework: "字节 TraeWork",
  qoder: "阿里 Qoder",
};

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultChannel?: Channel;
}

export function AddAccountDialog({
  open,
  onOpenChange,
  defaultChannel,
}: AddAccountDialogProps) {
  const { mutate } = useSWRConfig();
  const [stage, setStage] = React.useState<Stage>({ phase: "pick" });
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = React.useRef(0);

  const reset = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setStage({ phase: "pick" });
  }, []);

  React.useEffect(() => {
    if (open && defaultChannel) {
      void start(defaultChannel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  function stopPolling() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function start(channel: Channel) {
    try {
      const before = await api<AppState>("/api/state");
      countRef.current = before.accounts.length;
    } catch {
      countRef.current = 0;
    }
    try {
      const r = await api<{ auth_url: string }>("/api/login/start", { channel });
      setStage({ phase: "waiting", channel, authUrl: r.auth_url });
      window.open(r.auth_url, "_blank", "noopener");
      stopPolling();
      timerRef.current = setInterval(async () => {
        try {
          const st = await api<AppState>("/api/state");
          if (!st.login_busy) {
            stopPolling();
            const added = st.accounts.length > countRef.current;
            setStage({ phase: "done", channel, added });
            await mutate("/api/state");
          }
        } catch {
          /* 轮询失败静默重试 */
        }
      }, 2000);
    } catch (err) {
      toast.error(
        `发起登录失败：${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async function cancel() {
    stopPolling();
    try {
      await api("/api/login/cancel", {});
    } catch {
      /* 忽略 */
    }
    reset();
    onOpenChange(false);
  }

  const title =
    stage.phase === "pick"
      ? "添加账号"
      : stage.phase === "waiting"
        ? `登录 ${CHANNEL_LABEL[stage.channel]}`
        : "登录完成";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (stage.phase === "waiting") {
            stopPolling();
            void api("/api/login/cancel", {}).catch(() => {});
          }
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {stage.phase === "pick"
              ? "选择渠道后将打开浏览器授权页面，登录成功会自动导入。"
              : stage.phase === "waiting"
                ? "已打开授权页面，完成登录后此处会自动继续。"
                : stage.added
                  ? "账号已导入并加入账号池。"
                  : "未检测到新账号，可能登录未完成。"}
          </DialogDescription>
        </DialogHeader>

        {stage.phase === "pick" && (
          <div className="grid gap-2">
            {CHANNELS.map((ch) => (
              <Button
                key={ch}
                variant="outline"
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
        )}

        {stage.phase === "waiting" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin text-primary" />
              正在等待授权完成…
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted p-2">
              <code className="min-w-0 flex-1 truncate px-1 font-mono text-xs">
                {stage.authUrl}
              </code>
              <CopyButton value={stage.authUrl} label="授权链接" />
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => window.open(stage.authUrl, "_blank", "noopener")}
              >
                <ExternalLink />
                重新打开授权页
              </Button>
              <Button variant="ghost" onClick={() => void cancel()}>
                取消
              </Button>
            </div>
          </div>
        )}

        {stage.phase === "done" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              {stage.added ? (
                <>
                  <CheckCircle2 className="size-4 text-success" />
                  导入成功，账号已进入轮换池
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-destructive" />
                  未检测到新账号
                </>
              )}
            </div>
            <div className="flex gap-2">
              {stage.added ? (
                <>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      reset();
                      onOpenChange(false);
                    }}
                  >
                    完成
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void start(stage.channel)}
                  >
                    再添加一个
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    className="flex-1"
                    onClick={() => void start(stage.channel)}
                  >
                    重试
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      reset();
                      onOpenChange(false);
                    }}
                  >
                    关闭
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
