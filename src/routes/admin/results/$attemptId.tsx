import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  ImageIcon,
  Loader2,
  PlayCircle,
  TriangleAlert,
  Unlock,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { CollapsibleSection } from "@/components/collapsible-section";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { releaseResult, reviewIntegrity } from "@/lib/api";
import type { ProctoringArtifactDto, ProctoringStorageFailureDto } from "@/lib/api";
import { listAttemptProctoringArtifacts } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { formatDateTime, formatDuration, formatPercent, integrityEventLabel } from "@/lib/format";
import { resultDetailQuery } from "@/lib/queries";
import {
  attemptStatusLabel,
  attemptStatusTone,
  difficultyTone,
  integrityStatusTone,
  percentTone,
} from "@/lib/status";

export const Route = createFileRoute("/admin/results/$attemptId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(resultDetailQuery(params.attemptId)),
  component: AdminResultDetail,
});

function evidenceReasonLabel(reason: string | null): string {
  if (!reason) return "Periodic snapshot";
  if (reason === "interval") return "Periodic snapshot";
  if (reason === "manual") return "Manual capture";
  return integrityEventLabel(reason as Parameters<typeof integrityEventLabel>[0]);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Evidence lives in a private bucket, so nothing is fetched until an
 * administrator opens this panel and every view is a short-lived signed URL.
 */
function ProctoringEvidence({ attemptId }: { attemptId: string }) {
  const [artifacts, setArtifacts] = useState<ProctoringArtifactDto[] | null>(null);
  const [failure, setFailure] = useState<ProctoringStorageFailureDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setFailure(null);
    try {
      const result = await listAttemptProctoringArtifacts({ data: { attemptId, limit: 60 } });
      if (result.status === "ok") setArtifacts(result.artifacts);
      else {
        setArtifacts(null);
        setFailure(result.failure);
      }
    } catch (error) {
      setFailure({
        code: "read_failed",
        message: errorMessage(error, "Could not load evidence"),
      });
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  if (!loaded) {
    return (
      <Button type="button" variant="outline" onClick={() => void load()}>
        <Database className="size-4" />
        Load camera evidence
      </Button>
    );
  }

  if (failure) {
    return (
      <div className="space-y-2">
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {failure.message}
        </p>
        {failure.hint ? <p className="text-xs text-muted-foreground">{failure.hint}</p> : null}
        <Button type="button" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const items = artifacts ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title="No stored evidence"
        description="Nothing was captured for this attempt. That is expected when the camera is optional or storage was unavailable."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
        {items.filter((item) => item.kind === "clip").length} clip
        {items.filter((item) => item.kind === "clip").length === 1 ? "" : "s"} · links are temporary
        and private to this review.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              className="block w-full bg-muted/40"
              onClick={() => setOpenId(openId === item.id ? null : item.id)}
              aria-expanded={openId === item.id}
            >
              {item.url ? (
                item.kind === "clip" ? (
                  openId === item.id ? (
                    <video
                      src={item.url}
                      controls
                      playsInline
                      className="aspect-video w-full bg-black"
                    />
                  ) : (
                    <span className="flex aspect-video w-full items-center justify-center gap-2 text-sm text-muted-foreground">
                      <PlayCircle className="size-5" />
                      Play {evidenceReasonLabel(item.reason)} clip
                    </span>
                  )
                ) : (
                  <img
                    src={item.url}
                    alt={`Snapshot at ${formatDateTime(item.capturedAt)}`}
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                )
              ) : (
                <span className="flex aspect-video w-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="size-5" />
                  Preview unavailable
                </span>
              )}
            </button>
            <div className="space-y-0.5 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{evidenceReasonLabel(item.reason)}</p>
              <p>
                {formatDateTime(item.capturedAt)} · {formatBytes(item.byteSize)}
                {item.faceCount !== null
                  ? ` · ${item.faceCount} face${item.faceCount === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminResultDetail() {
  const { attemptId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: detail } = useSuspenseQuery(resultDetailQuery(attemptId));

  const [integrityStatus, setIntegrityStatus] = useState<string>(
    detail?.integrityReview.status ?? "Clean",
  );
  const [note, setNote] = useState(detail?.integrityReview.note ?? "");
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "result", attemptId] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "results"] });
  };

  const review = useMutation({
    mutationFn: async () => {
      await reviewIntegrity({
        data: {
          attemptId,
          integrityStatus: integrityStatus as "Clean" | "Review Required" | "Flagged",
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
    },
    onSuccess: async () => {
      toast.success("Integrity review saved");
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save the review")),
  });

  const release = useMutation({
    mutationFn: async () => {
      await releaseResult({ data: { attemptId } });
    },
    onSuccess: async () => {
      toast.success("Result released to the student");
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not release the result")),
  });

  if (!detail) {
    return (
      <div className="space-y-6">
        <PageHeader title="Result" />
        <EmptyState
          title="Attempt not found"
          description="This attempt does not exist. It may have been reset along with the demo data."
          action={
            <Button asChild>
              <Link
                to="/admin/results"
                search={{ assessmentId: undefined, integrityStatus: undefined }}
              >
                Back to results
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const attempt = detail.attempt;
  const correctCount = detail.rows.filter((row) => row.isCorrect).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.assessment.title}
        description={`${detail.student.name} · ${detail.student.email} · submitted ${formatDateTime(attempt.submittedAt)}`}
        actions={
          <>
            <StatusBadge tone={attemptStatusTone(attempt.status)}>
              {attemptStatusLabel(attempt.status)}
            </StatusBadge>
            <Button
              type="button"
              variant="outline"
              disabled={release.isPending}
              onClick={() => release.mutate()}
            >
              <Unlock className="size-4" />
              Release result
            </Button>
            <Button asChild variant="outline">
              <Link
                to="/admin/results"
                search={{ assessmentId: undefined, integrityStatus: undefined }}
              >
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Score"
          value={`${attempt.score ?? 0} / ${attempt.totalMarks}`}
          hint={formatPercent(attempt.percentage)}
          icon={attempt.passed ? CheckCircle2 : XCircle}
          tone={attempt.passed ? "success" : "danger"}
        />
        <StatCard
          label="Correct answers"
          value={`${correctCount} / ${detail.rows.length}`}
          icon={CheckCircle2}
          tone="primary"
        />
        <StatCard
          label="Time spent"
          value={formatDuration(attempt.timeSpentSec)}
          hint={`of ${detail.assessment.duration} minutes`}
        />
        <StatCard
          label="Integrity"
          value={detail.integrityReview.status}
          hint={`${detail.events.length} event${detail.events.length === 1 ? "" : "s"}`}
          icon={TriangleAlert}
          tone={
            detail.integrityReview.status === "Clean"
              ? "success"
              : detail.integrityReview.status === "Flagged"
                ? "danger"
                : "warning"
          }
        />
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        {detail.integrityAdvisory}
      </p>

      <div className="space-y-3">
        <CollapsibleSection
          title="Integrity review"
          description="Set the standing an administrator records for this attempt."
          defaultOpen
          badge={
            <StatusBadge
              tone={
                detail.integrityReview.status === "Clean"
                  ? "success"
                  : detail.integrityReview.status === "Flagged"
                    ? "danger"
                    : "warning"
              }
            >
              {detail.integrityReview.status}
            </StatusBadge>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="integrityStatus">Status</Label>
              <Select value={integrityStatus} onValueChange={setIntegrityStatus}>
                <SelectTrigger id="integrityStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Clean">Clean</SelectItem>
                  <SelectItem value="Review Required">Review Required</SelectItem>
                  <SelectItem value="Flagged">Flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Reviewer note</Label>
              <Textarea
                id="note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What did you check and what did you conclude?"
              />
            </div>
            <Button type="button" onClick={() => review.mutate()} disabled={review.isPending}>
              Save review
            </Button>
            {detail.integrityReview.reviewedAt ? (
              <p className="text-xs text-muted-foreground">
                Last reviewed {formatDateTime(detail.integrityReview.reviewedAt)}
              </p>
            ) : null}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Event log"
          description="Every integrity signal recorded during the attempt, in order."
          badge={
            <StatusBadge tone={detail.events.length === 0 ? "success" : "warning"}>
              {detail.events.length} signal{detail.events.length === 1 ? "" : "s"}
            </StatusBadge>
          }
        >
          {detail.events.length === 0 ? (
            <EmptyState
              title="Clean run"
              description="No tab switches, fullscreen exits or network drops."
            />
          ) : (
            <ol className="space-y-3">
              {detail.events.map((event) => (
                <li key={event.id} className="flex items-start gap-3">
                  <span
                    className={`mt-1 size-2.5 shrink-0 rounded-full ${
                      event.severity === "High"
                        ? "bg-destructive"
                        : event.severity === "Medium"
                          ? "bg-warning"
                          : "bg-accent"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {integrityEventLabel(event.eventType)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(event.timestamp)} · {event.severity}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Camera evidence"
          description="Snapshots and violation clips stored for this attempt. Evidence is supporting material for a human decision — never an automatic verdict."
        >
          <ProctoringEvidence attemptId={attemptId} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Question review"
          description="Answers are shown against the frozen snapshot taken when the attempt started."
          badge={
            <StatusBadge tone={attempt.passed ? "success" : "danger"}>
              {correctCount} / {detail.rows.length} correct
            </StatusBadge>
          }
        >
          <div className="space-y-3">
            {detail.rows.map((row) => (
              <div
                key={row.questionId}
                className="rounded-xl border border-border bg-surface/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    <span className="mr-2 text-muted-foreground">Q{row.index}.</span>
                    {row.questionText}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge tone={difficultyTone(row.difficulty)}>
                      {row.difficulty}
                    </StatusBadge>
                    <StatusBadge tone={row.isCorrect ? "success" : "danger"}>
                      {row.isCorrect
                        ? "Correct"
                        : row.selectedOption === null
                          ? "Skipped"
                          : "Wrong"}
                    </StatusBadge>
                  </div>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {row.options.map((option, optionIndex) => {
                    const isCorrect = optionIndex === row.correctOption;
                    const isSelected = optionIndex === row.selectedOption;
                    return (
                      <li
                        key={`${row.questionId}-option-${optionIndex}`}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                          isCorrect
                            ? "border-success/30 bg-success-soft text-success"
                            : isSelected
                              ? "border-destructive/30 bg-destructive-soft text-destructive"
                              : "border-transparent bg-card text-muted-foreground"
                        }`}
                      >
                        <span className="font-semibold">
                          {String.fromCharCode(65 + optionIndex)}.
                        </span>
                        <span className="flex-1">{option}</span>
                        {isCorrect ? (
                          <span className="text-xs font-semibold">Answer key</span>
                        ) : null}
                        {isSelected ? (
                          <span className="text-xs font-semibold">Student picked</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                <p className="mt-3 rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Why: </span>
                  {row.explanation}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.marks} marks · {row.negativeMarks} negative · topic {row.topic}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
