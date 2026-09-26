import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Archive, ClipboardList, Plus, Search } from "lucide-react";
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
import { archiveAssessment } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { formatDateTime, formatMinutes, truncate } from "@/lib/format";
import { assessmentsQuery, programsQuery } from "@/lib/queries";
import type { AssessmentStatusFilter } from "@/lib/queries";
import { assessmentStatusTone, difficultyTone } from "@/lib/status";

export const Route = createFileRoute("/admin/assessments/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(programsQuery()),
  component: AdminAssessments,
});

const statuses = ["all", "Draft", "Scheduled", "Live", "Completed", "Archived"] as const;

function AdminAssessments() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AssessmentStatusFilter>("all");
  const [program, setProgram] = useState<string>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const filters = {
    status,
    program,
    ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
  };

  const { data: programs } = useSuspenseQuery(programsQuery());
  const { data: assessments } = useSuspenseQuery(assessmentsQuery(filters));

  const archive = useMutation({
    mutationFn: async (assessmentId: string) => {
      await archiveAssessment({ data: { assessmentId } });
    },
    onSuccess: async () => {
      toast.success("Assessment archived");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not archive the assessment")),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessments"
        description="Create timed papers, control availability and review attempt counts."
        actions={
          <Button asChild>
            <Link to="/admin/assessments/new">
              <Plus className="size-4" />
              New assessment
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title or description"
              className="pl-9"
              aria-label="Search assessments"
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as AssessmentStatusFilter)}
          >
            <SelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "All statuses" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={program} onValueChange={setProgram}>
            <SelectTrigger aria-label="Filter by programme">
              <SelectValue placeholder="Programme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programmes</SelectItem>
              {programs.map((item) => (
                <SelectItem key={item.id} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {assessments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assessments match these filters"
          description="Adjust the filters or create a new assessment paper."
          action={
            <Button asChild>
              <Link to="/admin/assessments/new">
                <Plus className="size-4" />
                New assessment
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell>
                        <Link
                          to="/admin/assessments/$assessmentId"
                          params={{ assessmentId: assessment.id }}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {truncate(assessment.title, 48)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {assessment.program} · {assessment.module}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone={assessmentStatusTone(assessment.status)}>
                            {assessment.status}
                          </StatusBadge>
                          <StatusBadge tone={difficultyTone(assessment.difficulty)}>
                            {assessment.difficulty}
                          </StatusBadge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {assessment.questionCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatMinutes(assessment.duration)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="font-medium text-foreground">{assessment.attempts}</span>
                        {assessment.activeAttempts > 0 ? (
                          <span className="ml-1 text-xs text-primary">
                            ({assessment.activeAttempts} live)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {assessment.startsAt || assessment.endsAt
                          ? `${formatDateTime(assessment.startsAt)} → ${formatDateTime(assessment.endsAt)}`
                          : "Always open"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              to="/admin/assessments/$assessmentId"
                              params={{ assessmentId: assessment.id }}
                            >
                              Edit
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Archive ${assessment.title}`}
                            disabled={archive.isPending || assessment.status === "Archived"}
                            onClick={() => archive.mutate(assessment.id)}
                          >
                            <Archive className="size-4" />
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
