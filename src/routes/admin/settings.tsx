import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { CollapsibleSection } from "@/components/collapsible-section";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { resetDemoData, updateSettings } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/admin/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery()),
  component: AdminSettings,
});

const SECURITY_BASELINE = [
  ["cameraRequired", "Require camera"],
  ["microphoneRequired", "Require microphone"],
  ["fullscreenRequired", "Require fullscreen"],
  ["detectTabSwitch", "Detect tab switches"],
  ["detectWindowBlur", "Detect window blur"],
  ["randomizeQuestions", "Randomize question order"],
  ["randomizeOptions", "Randomize option order"],
  ["disableBackNavigation", "Disable back navigation"],
  ["autoSubmitOnExpiry", "Auto-submit when time expires"],
] as const;

function AdminSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQuery());

  const [organisation, setOrganisation] = useState(settings.organisation);
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail);
  const [resultsAutoRelease, setResultsAutoRelease] = useState(settings.resultsAutoRelease);
  const [security, setSecurity] = useState(settings.defaultSecurity);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrganisation(settings.organisation);
    setSupportEmail(settings.supportEmail);
    setResultsAutoRelease(settings.resultsAutoRelease);
    setSecurity(settings.defaultSecurity);
  }, [settings]);

  const patchSecurity = (next: Partial<typeof security>) =>
    setSecurity((current) => ({ ...current, ...next }));

  const enabledBaselineCount = SECURITY_BASELINE.filter(([key]) => security[key]).length;

  const save = useMutation({
    mutationFn: async () => {
      await updateSettings({
        data: {
          organisation: organisation.trim(),
          supportEmail: supportEmail.trim(),
          resultsAutoRelease,
          defaultSecurity: security,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Settings saved");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (submitError) => {
      const message = errorMessage(submitError, "Could not save settings");
      setError(message);
      toast.error(message);
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      return resetDemoData();
    },
    onSuccess: async (result) => {
      toast.success("Demo data reset", {
        description: `${result.counts.users} users · ${result.counts.questions} questions · ${result.counts.assessments} assessments`,
      });
      await queryClient.invalidateQueries();
    },
    onError: (resetError) => toast.error(errorMessage(resetError, "Could not reset demo data")),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Organisation defaults, result release policy and the security baseline applied to new papers."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
            >
              {reset.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Reset demo data
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save settings
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <CollapsibleSection
          title="Organisation"
          description="Shown across the assessment centre."
          defaultOpen
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organisation">Organisation name</Label>
              <Input
                id="organisation"
                value={organisation}
                onChange={(event) => setOrganisation(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={supportEmail}
                onChange={(event) => setSupportEmail(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="resultsAutoRelease" className="text-sm font-normal">
                Release results to students as soon as they submit
              </Label>
              <Switch
                id="resultsAutoRelease"
                checked={resultsAutoRelease}
                onCheckedChange={setResultsAutoRelease}
              />
            </div>
            {resultsAutoRelease ? null : (
              <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
                With auto-release off, results stay hidden until an administrator releases them from
                the results list.
              </p>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Default security baseline"
          description="Applied when a new assessment is created. Each paper can override these values."
          badge={
            <StatusBadge tone="neutral">
              {enabledBaselineCount} of {SECURITY_BASELINE.length} on
            </StatusBadge>
          }
        >
          <div className="space-y-3">
            {SECURITY_BASELINE.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`default-${key}`} className="text-sm font-normal">
                  {label}
                </Label>
                <Switch
                  id={`default-${key}`}
                  checked={security[key]}
                  onCheckedChange={(checked) => patchSecurity({ [key]: checked })}
                />
              </div>
            ))}
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defaultWarn">Warn after events</Label>
                <Input
                  id="defaultWarn"
                  type="number"
                  min={0}
                  max={100}
                  value={security.warnAfterEvents}
                  onChange={(event) =>
                    patchSecurity({ warnAfterEvents: Number(event.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultFlag">Flag after events</Label>
                <Input
                  id="defaultFlag"
                  type="number"
                  min={1}
                  max={100}
                  value={security.flagAfterEvents}
                  onChange={(event) =>
                    patchSecurity({ flagAfterEvents: Number(event.target.value) })
                  }
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrity policy</CardTitle>
          <CardDescription>
            Recorded signals are indicators for human review only. CareerVeda does not treat a
            single signal as proof of misconduct — reviewers must examine the full attempt timeline
            before deciding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            rows={2}
            value={
              settings.resultsAutoRelease ? "Results auto-release: ON" : "Results auto-release: OFF"
            }
            aria-label="Integrity policy summary"
          />
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive-soft px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
