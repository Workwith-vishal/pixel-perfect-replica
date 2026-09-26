import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * A card whose body is only mounted while it is open.
 *
 * Admin detail pages stack several long, independent sections. Rendering them
 * all at once means every section's DOM, effects and queries are alive even
 * when the reviewer is looking at a different one, which is wasted work on a
 * page they may only glance at. Collapsing the body unmounts it, so a closed
 * section costs one summary row.
 */
export function CollapsibleSection({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Rendered on the right of the header, e.g. a count or a status pill. */
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-card shadow">
      <CollapsibleTrigger
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
      >
        <span className="min-w-0 space-y-1">
          <span className="block text-base font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </span>
          {description ? (
            <span className="block text-sm text-muted-foreground">{description}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          {badge}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </CollapsibleTrigger>
      {open ? <div className="border-t p-4">{children}</div> : null}
    </Collapsible>
  );
}
