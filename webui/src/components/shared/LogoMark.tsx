import { Workflow } from "lucide-react";

export function LogoMark() {
  return (
    <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
      <Workflow className="size-4.5" aria-hidden="true" />
    </span>
  );
}
