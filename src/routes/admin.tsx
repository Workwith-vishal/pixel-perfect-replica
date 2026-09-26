import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Library,
  Settings,
  Users,
} from "lucide-react";

import { AppShell, type NavItem } from "@/components/app-shell";
import { getSession } from "@/lib/api";
import { useViewer } from "@/lib/session";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const viewer = await getSession();
    if (!viewer) throw redirect({ to: "/login" });
    if (viewer.role !== "ADMIN") throw redirect({ to: "/student" });
  },
  component: AdminLayout,
});

const navItems: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  {
    to: "/admin/assessments",
    label: "Assessments",
    icon: ClipboardList,
    match: "/admin/assessments",
  },
  { to: "/admin/questions", label: "Question bank", icon: Library },
  { to: "/admin/students", label: "Students", icon: Users },
  { to: "/admin/monitoring", label: "Live monitoring", icon: Activity },
  { to: "/admin/results", label: "Results", icon: BarChart3 },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminLayout() {
  const viewer = useViewer();

  return (
    <AppShell items={navItems} title="Administrator workspace" subtitle={viewer.data?.email}>
      <Outlet />
    </AppShell>
  );
}
