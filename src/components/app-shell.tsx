import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, ShieldCheck, Sparkles, X, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useLogout, useViewer } from "@/lib/session";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Highlight the item when the current path starts with this prefix. */
  match?: string;
  badge?: number;
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="brand-gradient flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-soft">
        <ShieldCheck className="size-5" />
      </span>
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-foreground">
            CareerVeda
          </span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">
            Assessment Center
          </span>
        </span>
      )}
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {items.map((item) => {
        const href = item.match ?? item.to;
        const active = pathname === item.to || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function UserPanel({ compact = false }: { compact?: boolean }) {
  const viewer = useViewer();
  const logout = useLogout();

  return (
    <div className="space-y-3 p-3">
      <Separator />
      <div className="flex items-center gap-3">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
            {initials(viewer.data?.name ?? "User")}
          </AvatarFallback>
        </Avatar>
        {compact ? null : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {viewer.data?.name ?? "Signed in"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {viewer.data?.program ?? viewer.data?.role ?? ""}
            </p>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function AppShell({
  items,
  children,
  title,
  subtitle,
  actions,
}: {
  items: NavItem[];
  children: ReactNode;
  title?: string | undefined;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">
          <BrandMark />
        </div>
        <NavLinks items={items} />
        <UserPanel />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar shadow-lift">
            <div className="flex h-16 items-center justify-between px-5">
              <BrandMark />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <NavLinks items={items} onNavigate={() => setMobileOpen(false)} />
            <UserPanel />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <div className="lg:hidden">
              <BrandMark compact />
            </div>
            <div className="hidden min-w-0 flex-1 lg:block">
              {title ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{title}</p>
                  {subtitle ? (
                    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-1 items-center justify-end gap-2">
              <span className="hidden items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success sm:inline-flex">
                <Sparkles className="size-3.5" />
                Secure exam mode
              </span>
              {actions}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
