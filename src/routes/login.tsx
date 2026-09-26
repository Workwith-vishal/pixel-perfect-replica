import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, GraduationCap, Loader2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { BrandMark } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const demoAccounts = [
  { label: "Administrator", email: "admin@careerveda.in", password: "Admin@123" },
  { label: "Student (PG)", email: "student@careerveda.in", password: "Student@123" },
] as const;

const programmes = [
  { code: "PG", name: "Post Graduate", detail: "Product Management" },
  { code: "BA", name: "Business Analytics", detail: "Programme" },
  { code: "DA", name: "Data Analytics", detail: "Programme" },
] as const;

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("admin@careerveda.in");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await login({ data: { email, password } });
      return result.viewer.role;
    },
    onSuccess: async (role) => {
      await queryClient.invalidateQueries();
      await navigate({ to: role === "ADMIN" ? "/admin" : "/student", replace: true });
    },
    onError: (mutationError) => {
      setError(errorMessage(mutationError, "Unable to sign in. Please try again."));
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  };

  const applyDemo = (demo: (typeof demoAccounts)[number]) => {
    setEmail(demo.email);
    setPassword(demo.password);
    setError(null);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, oklch(0.55 0.21 262 / 0.55), transparent 45%), radial-gradient(circle at 85% 75%, oklch(0.7 0.13 214 / 0.45), transparent 50%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/10">
            <ShieldCheck className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">CareerVeda</span>
            <span className="block text-xs text-white/60">Assessment Center</span>
          </span>
        </div>

        <div className="relative max-w-lg space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Proctored assessments for every CareerVeda programme.
          </h1>
          <p className="text-sm leading-relaxed text-white/70">
            Timed question papers, camera and fullscreen integrity signals, live attempt monitoring
            and instant scoring — all in one place.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {programmes.map((programme) => (
              <div
                key={programme.code}
                className="rounded-xl border border-white/12 bg-white/5 p-4 backdrop-blur"
              >
                <p className="text-lg font-semibold">{programme.code}</p>
                <p className="mt-1 text-xs text-white/60">
                  {programme.name}
                  <br />
                  {programme.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/50">
          Integrity signals are advisory indicators for human review, not proof of misconduct.
        </p>
      </section>

      <section className="flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <BrandMark />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Use your CareerVeda assessment credentials to continue.
            </p>
          </div>

          <Card>
            <CardContent className="p-6">
              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@careerveda.in"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  {mutation.isPending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <GraduationCap className="size-3.5" />
              Demo accounts
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {demoAccounts.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => applyDemo(demo)}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                >
                  <span className="block text-sm font-medium text-foreground">{demo.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{demo.email}</span>
                  <span className="block text-xs text-muted-foreground">{demo.password}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
