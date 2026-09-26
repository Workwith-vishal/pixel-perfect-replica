import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { statusToneClasses, type StatusTone } from "@/lib/status";

export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        statusToneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
