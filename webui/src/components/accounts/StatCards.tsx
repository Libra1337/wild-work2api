import { CalendarClock, Coins, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import type { AppState } from "../../lib/api";
import { formatCredits } from "../../lib/utils";

export function StatCards({ state }: { state: AppState }) {
  const total = state.accounts.length;
  const available = state.accounts.filter(
    (a) => !a.disabled && !a.cooling,
  ).length;
  const credits = state.accounts.reduce((sum, a) => sum + a.credits, 0);

  const items = [
    { label: "账号总数", value: String(total), icon: Users },
    { label: "可用账号", value: String(available), icon: ShieldCheck },
    { label: "总积分", value: formatCredits(credits), icon: Coins },
    { label: "下次签到", value: state.next_checkin || "—", icon: CalendarClock },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardContent className="flex items-center gap-3 p-4 sm:p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Icon className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="truncate font-mono text-lg font-semibold leading-tight">
                {value}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
