import { Link, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, ClipboardList, PlayCircle, Timer } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMinutes, formatPercent, truncate } from "@/lib/format";
import {
  studentAssessmentListQuery,
  studentDashboardQuery,
  studentResultsQuery,
} from "@/lib/queries";
import { percentTone } from "@/lib/status";
import { useViewer } from "@/lib/session";

export const Route = createFileRoute("/student/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(studentDashboardQuery()),
      context.queryClient.ensureQueryData(studentAssessmentListQuery()),
      context.queryClient.ensureQueryData(studentResultsQuery()),
    ]),
  component: StudentDashboard,
});

function StudentDashboard() {
  const viewer = useViewer();
  const { data: stats } = useSuspenseQuery(studentDashboardQuery());
  const { data: assessments } = useSuspenseQuery(studentAssessmentListQuery());
  const { data: results } = useSuspenseQuery(studentResultsQuery());

  const open = assessments.filter(
    (assessment) => assessment.canStart || assessment.inProgressAttemptId,
  );
  const recentResults = results.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={viewer.data?.name ? `Hello, ${viewer.data.name}` : "Overview"}
        description={`${viewer.data?.program ?? ""} · ${viewer.data?.email ?? ""}`}
        actions={
          <Button asChild>
            <Link to="/student/assessments">
              <ClipboardList className="size-4" />
              Browse assessments
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available papers"
          value={stats.availableAssessments}
          hint="Open for your programme"
          icon={ClipboardList}
        />
        <StatCard
          label="Attempts"
          value={stats.attempts}
          hint={`${stats.completed} completed`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="In progress"
          value={stats.inProgress}
          hint={stats.inProgress > 0 ? "Resume where you left off" : "Nothing running"}
          icon={Timer}
          tone="warning"
        />
        <StatCard
          label="Average score"
          value={formatPercent(stats.averagePercentage)}
          hint={`${stats.releasedResults} result${stats.releasedResults === 1 ? "" : "s"} released`}
          icon={Award}
          tone="accent"
        />
      </div>

      {stats.inProgress > 0 ? (
        <Card className="border-primary/30 bg-primary-soft/30">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                You have an attempt in progress
              </p>
              <p className="text-sm text-muted-foreground">
                The timer keeps running — resume before the deadline.
              </p>
            </div>
            {open.find((assessment) => assessment.inProgressAttemptId) ? (
              <Button asChild>
                <Link
                  to="/student/exam/$attemptId"
                  params={{
                    attemptId: open.find((assessment) => assessment.inProgressAttemptId)
                      ?.inProgressAttemptId as string,
                  }}
                >
                  <PlayCircle className="size-4" />
                  Resume exam
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ready to attempt</CardTitle>
          <CardDescription>Papers currently open for your programme.</CardDescription>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nothing open right now"
              description="When an administrator opens a paper for your programme it will appear here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {open.map((assessment) => (
                <li
                  key={assessment.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{assessment.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {truncate(assessment.description, 110)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {assessment.questionCount} questions · {formatMinutes(assessment.duration)} ·{" "}
                      {assessment.attemptsUsed}/{assessment.maxAttempts} attempts used
                    </p>
                  </div>
                  <Button asChild className="shrink-0">
                    <Link
                      to="/student/assessments/$assessmentId"
                      params={{ assessmentId: assessment.id }}
                    >
                      {assessment.inProgressAttemptId ? "Resume" : "Start"}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent results</CardTitle>
          <CardDescription>Only released results are visible.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentResults.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No released results yet"
              description="Results appear once you submit and an administrator releases them."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentResults.map((result) => (
                    <TableRow key={result.attemptId}>
                      <TableCell className="max-w-[320px] truncate font-medium">
                        {result.assessmentTitle}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge tone={percentTone(result.percentage)}>
                          {result.score ?? 0}/{result.totalMarks} ·{" "}
                          {formatPercent(result.percentage)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        {result.passed ? (
                          <StatusBadge tone="success">Pass</StatusBadge>
                        ) : (
                          <StatusBadge tone="danger">Fail</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(result.submittedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
