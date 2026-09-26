import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Award, ClipboardList, LayoutDashboard, UserRound } from "lucide-react";

import { AppShell, type NavItem } from "@/components/app-shell";
import { getSession } from "@/lib/api";
import { useViewer } from "@/lib/session";

export const Route = createFileRoute("/student")({
  beforeLoad: async () => {
    const viewer = await getSession();
    if (!viewer) throw redirect({ to: "/login" });
    if (viewer.role !== "STUDENT") throw redirect({ to: "/admin" });
  },
  component: StudentLayout,
});

const navItems: NavItem[] = [
  { to: "/student", label: "Overview", icon: LayoutDashboard },
  {
    to: "/student/assessments",
    label: "My assessments",
    icon: ClipboardList,
    match: "/student/assessments",
  },
  { to: "/student/results", label: "My results", icon: Award },
  { to: "/student/profile", label: "Profile", icon: UserRound },
];

function StudentLayout() {
  const viewer = useViewer();

  return (
    <AppShell
      items={navItems}
      title={viewer.data?.name ? `Welcome, ${viewer.data.name}` : "Student workspace"}
      subtitle={viewer.data?.program}
    >
      <Outlet />
    </AppShell>
  );
}
