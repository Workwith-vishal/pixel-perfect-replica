import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { getSession } from "@/lib/api";

// `/` is a pure dispatcher: send signed-in users to their workspace and
// everyone else to the sign-in screen.
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const viewer = await getSession();
    if (!viewer) throw redirect({ to: "/login" });
    throw redirect({ to: viewer.role === "ADMIN" ? "/admin" : "/student" });
  },
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}
