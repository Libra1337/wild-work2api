import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg bg-logo-background p-1 shadow-sm", className)}
    >
      <svg viewBox="0 0 64 64" className="size-full">
        <defs>
          <linearGradient
            id="reso-mark"
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
          d="M21 17v30M21 17h11a9.5 9.5 0 0 1 0 19H21"
          fill="none"
          stroke="url(#reso-mark)"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M31 36l13 11"
          fill="none"
          stroke="url(#reso-mark)"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M48 14v7m0 0-3.2-3.2M48 21l3.2-3.2"
          fill="none"
          stroke="var(--logo-highlight)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="48" cy="32" r="3.2" fill="var(--logo-start)" />
      </svg>
    </div>
  )
}
