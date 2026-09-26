import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Award, Clock, Lock } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/format";
import { studentResultsQuery } from "@/lib/queries";
import {
  attemptStatusLabel,
  attemptStatusTone,
  integrityStatusTone,
  percentTone,
} from "@/lib/status";

export const Route = createFileRoute("/student/results")({
  loader: ({ context }) => context.queryClient.ensureQueryData(studentResultsQuery()),
  component: StudentResults,
});

function StudentResults() {
  const { data: results } = useSuspenseQuery(studentResultsQuery());

  const total = results.length;
  const average = results.length
    ? Math.round(
        results.reduce((sum, result) => sum + (result.percentage ?? 0), 0) / results.length,
      )
    : null;
  const passed = results.filter((result) => result.passed).length;
  const best = results.reduce<number | null>((max, result) => {
    const value = result.percentage ?? 0;
    return max === null || value > max ? value : max;
  }, null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My results"
        description="Released results only. Ask your administrator if an attempt is missing."
      />

      {total === 0 ? (
        <EmptyState
          icon={Award}
          title="No results released yet"
          description="Once you submit an assessment and it is released, your score and standing appear here."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Results released
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">{total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Average
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  {formatPercent(average)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Best score
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">{formatPercent(best)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attempt history</CardTitle>
              <CardDescription>
                {passed} of {total} released results passed. Integrity signals are advisory
                indicators reviewed by an administrator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assessment</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Result</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                      <TableHead>Integrity</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow key={result.attemptId}>
                        <TableCell className="max-w-[280px]">
                          <p className="truncate font-medium text-foreground">
                            {result.assessmentTitle}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Submission {result.attemptId.slice(0, 12).toUpperCase()}
                          </p>
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
                        <TableCell className="text-right text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <Clock className="size-3.5" />
                            {result.submittedAt
                              ? formatDuration(
                                  Math.max(
                                    0,
                                    (new Date(result.submittedAt).getTime() -
                                      new Date(result.startedAt).getTime()) /
                                      1000,
                                  ),
                                )
                              : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge tone={integrityStatusTone(result.integrityStatus)}>
                              {result.integrityStatus}
                            </StatusBadge>
                            <StatusBadge tone={attemptStatusTone(result.status)}>
                              {attemptStatusLabel(result.status)}
                            </StatusBadge>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(result.submittedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Results remain hidden until an administrator releases them. Attempted but unreleased papers
        are not listed.
      </p>
    </div>
  );
}
