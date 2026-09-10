import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg bg-logo-background p-1 shadow-sm", className)}
    >
      <svg viewBox="0 0 64 64" className="size-full">
        <defs>
          <linearGradient
            id="ww2a-mark"
            x1="14"
            y1="12"
            x2="50"
            y2="52"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="var(--logo-start)" />
            <stop offset="1" stopColor="var(--logo-end)" />
          </linearGradient>
        </defs>
        <path
          d="M14 20v24M14 32c2 8 8 12 16 12M50 20v24M50 32c-2 8-8 12-16 12M24 26l8 18 8-18"
          fill="none"
          stroke="url(#ww2a-mark)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32 12v6m0 0-3-3m3 3 3-3"
          fill="none"
          stroke="var(--logo-highlight)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="44" r="3" fill="var(--logo-start)" />
      </svg>
    </div>
  )
}
