import * as React from "react";
import { NavLink } from "react-router-dom";
import { CircleDollarSign, Coins, ScrollText, Settings2, Sun, Moon, MonitorSmartphone } from "lucide-react";
import { useTheme } from "../theme/theme-provider";
import { LogoMark } from "../shared/LogoMark";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

const NAV = [
  { to: "/", label: "总览", icon: Coins },
  { to: "/fees", label: "费率", icon: CircleDollarSign },
  { to: "/logs", label: "日志", icon: ScrollText },
  { to: "/settings", label: "设置", icon: Settings2 },
];

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const next =
    mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
  const Icon =
    mode === "light" ? Sun : mode === "dark" ? Moon : MonitorSmartphone;
  const label =
    mode === "light" ? "亮色" : mode === "dark" ? "暗色" : "跟随系统";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setMode(next)}
      aria-label={`主题：${label}，点击切换`}
      title={`主题：${label}`}
    >
      <Icon />
    </Button>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">
                wild-work2api
              </span>
              <span className="text-xs leading-tight text-muted-foreground">
                多渠道聚合网关控制台
              </span>
            </div>
          </div>
          <nav aria-label="主导航" className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: NavIcon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )
                }
              >
                <NavIcon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-muted-foreground sm:px-6">
        仅供个人学习研究 · 请遵守各上游平台服务条款
      </footer>
    </div>
  );
}
