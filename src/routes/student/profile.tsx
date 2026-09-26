import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Award, GraduationCap, Mail, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
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
import { formatDate, formatDateTime, formatPercent, initials } from "@/lib/format";
import { studentProfileQuery } from "@/lib/queries";
import { useViewer } from "@/lib/session";
import {
  attemptStatusLabel,
  attemptStatusTone,
  integrityStatusTone,
  percentTone,
} from "@/lib/status";

export const Route = createFileRoute("/student/profile")({
  loader: ({ context }) => context.queryClient.ensureQueryData(studentProfileQuery()),
  component: StudentProfile,
});

function StudentProfile() {
  const viewer = useViewer();
  const { data: profile } = useSuspenseQuery(studentProfileQuery());

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your enrolment details and full attempt history." />

      <Card>
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-lg font-semibold text-primary">
            {initials(profile.name)}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-lg font-semibold text-foreground">{profile.name}</p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="size-3.5" />
              {profile.email}
            </p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <GraduationCap className="size-3.5" />
              {profile.program}
            </p>
            <p className="text-xs text-muted-foreground">
              Enrolled {formatDate(profile.createdAt)}
            </p>
          </div>
          <StatusBadge tone="info">
            <ShieldCheck className="size-3" />
            {viewer.data?.role === "STUDENT" ? "Student" : "Candidate"}
          </StatusBadge>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attempts" value={profile.attempts.length} />
        <StatCard label="Completed" value={profile.completed} tone="success" />
        <StatCard
          label="Average"
          value={formatPercent(profile.averagePercentage)}
          tone="accent"
          icon={Award}
        />
        <StatCard label="Flagged" value={profile.flagged} tone="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attempt history</CardTitle>
          <CardDescription>
            Scores are hidden until the result is released, matching what you see in My results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile.attempts.length === 0 ? (
            <EmptyState title="No attempts yet" description="Start a paper from My assessments." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Integrity</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.attempts.map((attempt) => (
                    <TableRow key={attempt.attemptId}>
                      <TableCell className="max-w-[260px] truncate font-medium">
                        {attempt.assessmentTitle}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={attemptStatusTone(attempt.status)}>
                          {attemptStatusLabel(attempt.status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        {attempt.resultReleased && attempt.percentage !== null ? (
                          <StatusBadge tone={percentTone(attempt.percentage)}>
                            {attempt.score ?? 0}/{attempt.totalMarks} ·{" "}
                            {formatPercent(attempt.percentage)}
                          </StatusBadge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not released</span>
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
                      <TableCell className="text-xs text-muted-foreground">
                        {attempt.submittedAt ? formatDateTime(attempt.submittedAt) : "—"}
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
