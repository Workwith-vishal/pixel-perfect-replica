import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Expand,
  Globe,
  ListChecks,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Play,
  ScanFace,
  ShieldAlert,
  Shuffle,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startAttempt } from "@/lib/api";
import type { AssessmentInstructionsDto, StudentAssessmentDto } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { formatDateTime, formatMinutes } from "@/lib/format";
import {
  deviceLabel,
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
  idleDeviceCheck,
  probeDevices,
  stopStream,
  type DeviceCheck,
} from "@/lib/proctoring";
import { assessmentInstructionsQuery, studentAssessmentListQuery } from "@/lib/queries";
import { faceDetectionSupported, isSecureMediaContext } from "@/lib/proctoring";

export const Route = createFileRoute("/student/assessments/$assessmentId")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(assessmentInstructionsQuery(params.assessmentId)),
      context.queryClient.ensureQueryData(studentAssessmentListQuery()),
    ]),
  component: AssessmentInstructionsPage,
});

type CheckState = "ok" | "warn" | "fail";

function EnvironmentRow({
  icon: Icon,
  label,
  state,
  detail,
}: {
  icon: typeof Camera;
  label: string;
  state: CheckState;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm text-foreground">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
      <span
        className={`text-xs font-semibold ${
          state === "ok" ? "text-success" : state === "warn" ? "text-warning" : "text-destructive"
        }`}
      >
        {detail}
      </span>
    </div>
  );
}

function DeviceRow({
  icon: Icon,
  label,
  state,
  blockedHint,
}: {
  icon: typeof Camera;
  label: string;
  state: DeviceCheck["camera"];
  blockedHint: string;
}) {
  const granted = state === "granted";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm text-foreground">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
      <span
        className={`text-xs font-semibold ${
          granted ? "text-success" : state === "idle" ? "text-muted-foreground" : "text-destructive"
        }`}
      >
        {state === "idle" ? deviceLabel(state) : granted ? "Ready" : blockedHint}
      </span>
    </div>
  );
}

function AssessmentInstructionsPage() {
  const { assessmentId } = Route.useParams();
  const { data: instructions } = useSuspenseQuery(assessmentInstructionsQuery(assessmentId));
  const { data: catalogue } = useSuspenseQuery(studentAssessmentListQuery());
  const listing = catalogue.find((item) => item.id === assessmentId);

  if (!instructions) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Assessment unavailable"
          actions={
            <Button asChild variant="outline">
              <Link to="/student/assessments">
                <ArrowLeft className="size-4" />
                All assessments
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={ShieldAlert}
          title="This paper is not available to you"
          description="It may have been unpublished, closed, or restricted to a different programme. Check My assessments for the papers you can sit."
          action={
            <Button asChild>
              <Link to="/student/assessments">Back to my assessments</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <InstructionsView assessmentId={assessmentId} instructions={instructions} listing={listing} />
  );
}

function InstructionsView({
  assessmentId,
  instructions,
  listing,
}: {
  assessmentId: string;
  instructions: AssessmentInstructionsDto;
  listing: StudentAssessmentDto | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [check, setCheck] = useState<DeviceCheck>(idleDeviceCheck);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [consented, setConsented] = useState(false);
  const [starting, setStarting] = useState(false);

  const security = instructions.security;
  const blockedReason = listing?.blockedReason ?? null;
  const canAttempt = Boolean(listing?.canStart) || Boolean(listing?.inProgressAttemptId);
  const resuming = Boolean(listing?.inProgressAttemptId);
  const secureContext = isSecureMediaContext();
  const faceDetection = faceDetectionSupported();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  const runCheck = async () => {
    setChecking(true);
    const { stream, check: next } = await probeDevices({
      camera: security.cameraRequired,
      microphone: security.microphoneRequired,
    });
    stopStream(stream);
    setCheck(next);
    if (security.fullscreenRequired && fullscreenSupported()) {
      const granted = await enterFullscreen(document.documentElement);
      if (!granted) await exitFullscreen();
      setCheck((current) => ({ ...current, fullscreen: granted ? "granted" : "denied" }));
    } else if (security.fullscreenRequired) {
      setCheck((current) => ({ ...current, fullscreen: "unsupported" }));
    }
    setCheckedAt(Date.now());
    setChecking(false);
  };

  // A fresh start is blocked until the required device checks actually pass, so a
  // candidate is never seated into a paper whose camera they cannot provide.
  const environmentBlockers = security.cameraRequired
    ? !secureContext
      ? "Camera access needs a secure connection. Open this page over HTTPS or on localhost."
      : checkedAt === null
        ? "Run the system check before starting so we can confirm your camera works."
        : check.camera !== "granted"
          ? "Your camera is not ready yet. Run the system check and allow camera access."
          : null
    : null;
  const blockedByEnvironment = !resuming && !canAttempt ? null : environmentBlockers;

  const begin = useMutation({
    mutationFn: async () => {
      const result = await startAttempt({ data: { assessmentId } });
      return result.attemptId;
    },
    onSuccess: async (attemptId) => {
      setStarting(false);
      await queryClient.invalidateQueries();
      await navigate({ to: "/student/exam/$attemptId", params: { attemptId } });
    },
    onError: (error) => {
      setStarting(false);
      toast.error(errorMessage(error, "Could not start the assessment"));
    },
  });

  const start = async () => {
    setStarting(true);
    begin.mutate();
  };

  const requirementRows = [
    security.cameraRequired ? "Camera" : null,
    security.microphoneRequired ? "Microphone" : null,
    security.fullscreenRequired ? "Fullscreen" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <PageHeader
        title={instructions.title}
        description={`${instructions.program} · ${instructions.module}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/student/assessments">
              <ArrowLeft className="size-4" />
              All assessments
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About this paper</CardTitle>
              <CardDescription>{instructions.eligibility}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {instructions.description}
              </p>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Questions</dt>
                  <dd className="text-lg font-semibold text-foreground">
                    {instructions.questionCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Duration</dt>
                  <dd className="text-lg font-semibold text-foreground">
                    {formatMinutes(instructions.duration)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Navigation</dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {instructions.navigationMode === "sequential" ? "Sequential" : "Free"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Attempts</dt>
                  <dd className="text-lg font-semibold text-foreground">
                    {listing?.attemptsUsed ?? 0}/{listing?.maxAttempts ?? 1}
                  </dd>
                </div>
              </dl>
              {instructions.startsAt || instructions.endsAt ? (
                <p className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  Window: {formatDateTime(instructions.startsAt)} →{" "}
                  {formatDateTime(instructions.endsAt)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Before you start</CardTitle>
              <CardDescription>
                Read these rules — they are enforced during the attempt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {[
                  "The timer starts immediately and does not pause, even if you close the tab.",
                  security.autoSubmitOnExpiry
                    ? "Your paper is submitted automatically when the time runs out."
                    : "Unanswered questions score zero when the time runs out.",
                  security.randomizeQuestions
                    ? "Questions are shuffled per candidate."
                    : "Questions appear in the fixed authored order.",
                  security.randomizeOptions
                    ? "Answer options are shuffled per candidate."
                    : "Answer options appear in the authored order.",
                  security.disableBackNavigation
                    ? "Back navigation is disabled — you can only move forward."
                    : "You may move between questions freely before submitting.",
                  "Flagging a question marks it for your own review only.",
                  "Only you can see your result, and only after it is released.",
                ].map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    {rule}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4 text-primary" />
                System check
              </CardTitle>
              <CardDescription>
                {requirementRows.length > 0
                  ? "Your browser must allow these before the exam opens."
                  : "No camera, microphone or fullscreen is required for this paper."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {security.cameraRequired ? (
                <DeviceRow
                  icon={check.camera === "granted" ? Camera : CameraOff}
                  label="Camera"
                  state={check.camera}
                  blockedHint="Blocked — allow access"
                />
              ) : null}
              {security.microphoneRequired ? (
                <DeviceRow
                  icon={check.microphone === "granted" ? Mic : MicOff}
                  label="Microphone"
                  state={check.microphone}
                  blockedHint="Blocked — allow access"
                />
              ) : null}
              {security.fullscreenRequired ? (
                <DeviceRow
                  icon={Expand}
                  label="Fullscreen"
                  state={check.fullscreen}
                  blockedHint="Unavailable"
                />
              ) : null}
              {security.detectTabSwitch || security.detectWindowBlur ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  Leaving this tab is recorded as an integrity signal.
                </p>
              ) : null}
              <EnvironmentRow
                icon={secureContext ? Lock : Globe}
                label="Secure connection"
                state={secureContext ? "ok" : "fail"}
                detail={secureContext ? "HTTPS / localhost" : "Insecure — camera blocked"}
              />
              <EnvironmentRow
                icon={online ? Wifi : WifiOff}
                label="Internet"
                state={online ? "ok" : "fail"}
                detail={online ? "Online" : "Offline"}
              />
              {security.cameraRequired ? (
                <EnvironmentRow
                  icon={faceDetection ? ScanFace : ShieldAlert}
                  label="Face detection"
                  state={faceDetection ? "ok" : "warn"}
                  detail={faceDetection ? "Available" : "Not supported — reduced checks"}
                />
              ) : null}
              {requirementRows.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={checking}
                  onClick={() => void runCheck()}
                >
                  {checking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Expand className="size-4" />
                  )}
                  {checking ? "Checking…" : "Run system check"}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {security.cameraRequired ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Camera className="size-4 text-primary" />
                  Camera monitoring &amp; privacy
                </CardTitle>
                <CardDescription>
                  Read this before you continue. The camera is an assessment-integrity control, not
                  a recording of you.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">What is collected</p>
                  <ul className="space-y-1.5">
                    {[
                      "A live camera preview used only to confirm your face is visible.",
                      "Face presence and count checks (one face, no face, more than one face).",
                      "Periodic still snapshots stored in a private, access-controlled storage bucket.",
                      "Short video clips captured only while an integrity signal is active, such as your face leaving the frame.",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">What is not collected</p>
                  <ul className="space-y-1.5">
                    {[
                      "No audio is recorded at any point.",
                      "No face recognition or biometric identity matching is performed — we only count faces, we never identify who they belong to.",
                      "No continuous background recording of your whole session.",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">Who can see it, and for how long</p>
                  <p>
                    Only authorised CareerVeda administrators can view this material, and only when
                    reviewing your attempt. Evidence is automatically deleted after 90 days, and a
                    review is advisory — a detection never fails an attempt on its own.
                  </p>
                </div>
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
                  By continuing you consent to this monitoring for the duration of this attempt. If
                  you do not consent, do not start — contact your programme coordinator instead.
                  Handling of this data is intended to align with the Digital Personal Data
                  Protection Act, 2023.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Start attempt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {blockedReason && !listing?.inProgressAttemptId ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  {blockedReason}
                </p>
              ) : null}
              {blockedByEnvironment ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  {blockedByEnvironment}
                </p>
              ) : null}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[var(--color-primary)]"
                  checked={consented}
                  onChange={(event) => setConsented(event.target.checked)}
                />
                <span className="text-sm text-muted-foreground">
                  {security.cameraRequired
                    ? "I understand the timing rules and the integrity signals this paper records. I have read the camera monitoring and privacy notice above, and I consent to my camera being monitored for this attempt."
                    : "I understand the timing rules and the integrity signals this paper records, and I am ready to begin."}
                </span>
              </label>

              <Button
                type="button"
                className="w-full"
                disabled={!canAttempt || !consented || starting || Boolean(blockedByEnvironment)}
                onClick={() => void start()}
              >
                {starting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : listing?.inProgressAttemptId ? (
                  <Shuffle className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {starting
                  ? "Starting…"
                  : listing?.inProgressAttemptId
                    ? "Resume attempt"
                    : "Start now"}
              </Button>

              <p className="text-xs text-muted-foreground">
                Integrity signals are advisory indicators for human review, not proof of misconduct.
                If your camera drops mid-exam you will be able to retry without losing your attempt.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">{instructions.program}</StatusBadge>
            <StatusBadge tone="neutral">{instructions.module}</StatusBadge>
            <StatusBadge tone="neutral">
              {instructions.navigationMode === "sequential" ? "Sequential" : "Free navigation"}
            </StatusBadge>
          </div>
        </div>
      </div>
    </div>
  );
}
