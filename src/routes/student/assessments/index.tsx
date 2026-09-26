import { Link, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, Info } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatMinutes, truncate } from "@/lib/format";
import { studentAssessmentListQuery } from "@/lib/queries";
import { assessmentStatusTone, difficultyTone } from "@/lib/status";

export const Route = createFileRoute("/student/assessments/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(studentAssessmentListQuery()),
  component: StudentAssessments,
});

function StudentAssessments() {
  const { data: assessments } = useSuspenseQuery(studentAssessmentListQuery());

  const startable = assessments.filter(
    (assessment) => assessment.canStart || assessment.inProgressAttemptId,
  );
  const upcoming = assessments.filter(
    (assessment) => !assessment.canStart && !assessment.inProgressAttemptId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My assessments"
        description="Papers released for your programme, with attempt limits and availability windows."
      />

      {startable.length === 0 && upcoming.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assessments available"
          description="Papers appear here when an administrator opens them for your programme."
        />
      ) : null}

      {startable.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Available now
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {startable.map((assessment) => (
              <Card key={assessment.id} className="card-hover">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={assessmentStatusTone(assessment.status)}>
                      {assessment.status}
                    </StatusBadge>
                    <StatusBadge tone={difficultyTone(assessment.difficulty)}>
                      {assessment.difficulty}
                    </StatusBadge>
                    {assessment.inProgressAttemptId ? (
                      <StatusBadge tone="warning">In progress</StatusBadge>
                    ) : null}
                  </div>
                  <CardTitle className="mt-1 text-base">{assessment.title}</CardTitle>
                  <CardDescription>{truncate(assessment.description, 160)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">Questions</dt>
                      <dd className="font-medium text-foreground">{assessment.questionCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Duration</dt>
                      <dd className="font-medium text-foreground">
                        {formatMinutes(assessment.duration)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Attempts used</dt>
                      <dd className="font-medium text-foreground">
                        {assessment.attemptsUsed}/{assessment.maxAttempts}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Module</dt>
                      <dd className="truncate font-medium text-foreground">{assessment.module}</dd>
                    </div>
                  </dl>
                  <Button asChild className="w-full">
                    <Link
                      to="/student/assessments/$assessmentId"
                      params={{ assessmentId: assessment.id }}
                    >
                      {assessment.inProgressAttemptId ? "Resume attempt" : "View instructions"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Not open yet
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {upcoming.map((assessment) => (
                <div
                  key={assessment.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{assessment.title}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      {assessment.blockedReason ?? "Not available"}
                      {assessment.startsAt ? ` · opens ${formatDateTime(assessment.startsAt)}` : ""}
                    </p>
                  </div>
                  <StatusBadge tone="neutral">
                    {assessment.questionCount} questions · {formatMinutes(assessment.duration)}
                  </StatusBadge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        The timer starts the moment you begin and does not pause. Read the instructions before
        starting.
      </p>
    </div>
  );
}
