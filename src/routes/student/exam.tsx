import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/api";

export const Route = createFileRoute("/student/exam")({
  beforeLoad: async () => {
    const viewer = await getSession();
    if (!viewer) throw redirect({ to: "/login" });
    if (viewer.role !== "STUDENT") throw redirect({ to: "/admin" });
  },
  component: ExamLayout,
});

/** The exam runs full-bleed: no sidebar, no scroll chrome, focus on the paper. */
function ExamLayout() {
  return <Outlet />;
}
