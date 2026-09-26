import { Link, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";

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
import { formatDate, formatDateTime, formatDuration, formatPercent } from "@/lib/format";
import { studentQuery } from "@/lib/queries";
import {
  attemptStatusLabel,
  attemptStatusTone,
  integrityStatusTone,
  percentTone,
} from "@/lib/status";

export const Route = createFileRoute("/admin/students/$studentId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(studentQuery(params.studentId)),
  component: AdminStudentDetail,
});

function AdminStudentDetail() {
  const { studentId } = Route.useParams();
  const { data: student } = useSuspenseQuery(studentQuery(studentId));

  if (!student) {
    return (
      <EmptyState
        title="Student not found"
        action={
          <Button asChild>
            <Link to="/admin/students">Back to students</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.name}
        description={`${student.email} · ${student.program} · joined ${formatDate(student.createdAt)}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/admin/students">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total attempts" value={student.attempts.length} />
        <StatCard label="Completed" value={student.completed} tone="success" />
        <StatCard
          label="Average score"
          value={formatPercent(student.averagePercentage)}
          tone="warning"
        />
        <StatCard label="Flagged" value={student.flagged} tone="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attempt history</CardTitle>
          <CardDescription>
            Every paper this candidate has started, with integrity standing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {student.attempts.length === 0 ? (
            <EmptyState
              title="No attempts yet"
              description="This student has not started an assessment."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead>Integrity</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.attempts.map((attempt) => (
                    <TableRow key={attempt.attemptId}>
                      <TableCell className="max-w-[240px] truncate font-medium">
                        {attempt.assessmentTitle}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={attemptStatusTone(attempt.status)}>
                          {attemptStatusLabel(attempt.status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {attempt.percentage === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <StatusBadge tone={percentTone(attempt.percentage)}>
                            {attempt.score ?? 0}/{attempt.totalMarks} ·{" "}
                            {formatPercent(attempt.percentage)}
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {attempt.passed === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : attempt.passed ? (
                          <StatusBadge tone="success">Pass</StatusBadge>
                        ) : (
                          <StatusBadge tone="danger">Fail</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {attempt.status === "in_progress"
                          ? "—"
                          : formatDuration(
                              Math.max(
                                0,
                                (new Date(attempt.submittedAt ?? attempt.startedAt).getTime() -
                                  new Date(attempt.startedAt).getTime()) /
                                  1000,
                              ),
                            )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={integrityStatusTone(attempt.integrityStatus)}>
                          {attempt.integrityStatus}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(attempt.startedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {attempt.resultReleased ? (
                          <Button asChild variant="ghost" size="icon" aria-label="Open result">
                            <Link
                              to="/admin/results/$attemptId"
                              params={{ attemptId: attempt.attemptId }}
                            >
                              <ExternalLink className="size-4" />
                            </Link>
                          </Button>
                        ) : null}
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
