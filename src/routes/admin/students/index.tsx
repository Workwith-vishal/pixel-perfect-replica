import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StudentEnrolDialog } from "@/components/student-enrol-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatPercent, initials } from "@/lib/format";
import { programsQuery, studentsQuery } from "@/lib/queries";
import { percentTone } from "@/lib/status";

export const Route = createFileRoute("/admin/students/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(studentsQuery()),
  component: AdminStudents,
});

function AdminStudents() {
  const { data: students } = useSuspenseQuery(studentsQuery());
  const { data: programs } = useSuspenseQuery(programsQuery());
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const rows = deferredSearch
    ? students.filter((student) =>
        `${student.name} ${student.email} ${student.program}`
          .toLowerCase()
          .includes(deferredSearch),
      )
    : students;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Enrolment, attempt history and integrity standing for every candidate."
        actions={
          <StudentEnrolDialog
            programs={programs}
            onCreated={(created) => {
              // Prepend rather than refetch so the row appears instantly and the
              // table keeps its current sort and scroll position.
              queryClient.setQueryData(studentsQuery().queryKey, (current) =>
                current ? [created, ...current] : [created],
              );
            }}
          />
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email or programme"
              className="pl-9"
              aria-label="Search students"
            />
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No students match your search" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Programme</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Flagged</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <Link
                          to="/admin/students/$studentId"
                          params={{ studentId: student.id }}
                          className="flex items-center gap-3"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                            {initials(student.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground hover:text-primary">
                              {student.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {student.email}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {student.program}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{student.attempts}</TableCell>
                      <TableCell className="text-right tabular-nums">{student.completed}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {student.flagged > 0 ? (
                          <StatusBadge tone="danger">{student.flagged}</StatusBadge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge tone={percentTone(student.avgPercentage)}>
                          {formatPercent(student.avgPercentage)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(student.createdAt)}
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
