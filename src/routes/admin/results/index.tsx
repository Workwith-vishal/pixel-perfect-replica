import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { EyeClosed, Filter, Search, Unlock } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { releaseAssessmentResults, releaseResult } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/format";
import { assessmentsQuery, resultsQuery } from "@/lib/queries";
import type { IntegrityFilter } from "@/lib/queries";
import {
  attemptStatusLabel,
  attemptStatusTone,
  integrityStatusTone,
  percentTone,
} from "@/lib/status";

export const Route = createFileRoute("/admin/results/")({
  validateSearch: (search: Record<string, unknown>) => ({
    assessmentId: typeof search["assessmentId"] === "string" ? search["assessmentId"] : undefined,
    integrityStatus:
      typeof search["integrityStatus"] === "string"
        ? (search["integrityStatus"] as IntegrityFilter)
        : undefined,
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(assessmentsQuery()),
      context.queryClient.ensureQueryData(resultsQuery()),
    ]),
  component: AdminResults,
});

const integrityFilters = ["all", "Clean", "Review Required", "Flagged"] as const;

function AdminResults() {
  const queryClient = useQueryClient();
  const { assessmentId, integrityStatus } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const { data: assessments } = useSuspenseQuery(assessmentsQuery());
  const { data: results } = useSuspenseQuery(
    resultsQuery({
      ...(assessmentId ? { assessmentId } : {}),
      ...(integrityStatus ? { integrityStatus } : {}),
      ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
    }),
  );

  const release = useMutation({
    mutationFn: async (attemptId: string) => {
      await releaseResult({ data: { attemptId } });
    },
    onSuccess: async () => {
      toast.success("Result released to the student");
      await queryClient.invalidateQueries({ queryKey: ["admin", "results"] });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not release the result")),
  });

  const releaseAll = useMutation({
    mutationFn: async (attemptId: string) => {
      await releaseAssessmentResults({ data: { attemptId } });
    },
    onSuccess: async () => {
      toast.success("All results for this assessment released");
      await queryClient.invalidateQueries({ queryKey: ["admin", "results"] });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not release results")),
  });

  const releaseAllRepresentative = results.find((result) => result.assessmentId === assessmentId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description="Graded attempts with per-question review, integrity events and result release."
        actions={
          assessmentId && releaseAllRepresentative ? (
            <Button
              type="button"
              variant="outline"
              disabled={releaseAll.isPending}
              onClick={() => releaseAll.mutate(releaseAllRepresentative.attemptId)}
            >
              <Unlock className="size-4" />
              Release all for this assessment
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student or assessment"
              className="pl-9"
              aria-label="Search results"
            />
          </div>
          <Select
            value={assessmentId ?? "all"}
            onValueChange={(value) =>
              void navigate({
                to: "/admin/results",
                search: {
                  assessmentId: value === "all" ? undefined : value,
                  integrityStatus,
                },
                replace: true,
              })
            }
          >
            <SelectTrigger aria-label="Filter by assessment">
              <SelectValue placeholder="Assessment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assessments</SelectItem>
              {assessments.map((assessment) => (
                <SelectItem key={assessment.id} value={assessment.id}>
                  {assessment.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={integrityStatus ?? "all"}
            onValueChange={(value) =>
              void navigate({
                to: "/admin/results",
                search: {
                  assessmentId,
                  integrityStatus: value === "all" ? undefined : (value as IntegrityFilter),
                },
                replace: true,
              })
            }
          >
            <SelectTrigger aria-label="Filter by integrity status">
              <SelectValue placeholder="Integrity" />
            </SelectTrigger>
            <SelectContent>
              {integrityFilters.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "Any integrity status" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {results.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No results match these filters"
          description="Clear the filters to see every graded attempt."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Assessment</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Integrity</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Release</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.attemptId}>
                      <TableCell>
                        <Link
                          to="/admin/students/$studentId"
                          params={{ studentId: result.studentId }}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {result.studentName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{result.studentEmail}</p>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                        {result.assessmentTitle}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge tone={percentTone(result.percentage)}>
                          {result.score}/{result.totalMarks} · {formatPercent(result.percentage)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatDuration(result.timeSpentSec)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone={result.passed ? "success" : "danger"}>
                            {result.passed ? "Pass" : "Fail"}
                          </StatusBadge>
                          <StatusBadge tone={attemptStatusTone(result.status)}>
                            {attemptStatusLabel(result.status)}
                          </StatusBadge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={integrityStatusTone(result.integrityStatus)}>
                          {result.integrityStatus}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(result.submittedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {result.resultReleased ? (
                            <StatusBadge tone="info">Released</StatusBadge>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={release.isPending}
                              onClick={() => release.mutate(result.attemptId)}
                            >
                              <Unlock className="size-4" />
                              Release
                            </Button>
                          )}
                          <Button asChild variant="ghost" size="icon" aria-label="Open result">
                            <Link
                              to="/admin/results/$attemptId"
                              params={{ attemptId: result.attemptId }}
                            >
                              <EyeClosed className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
