import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  Camera,
  CameraOff,
  Eye,
  Mic,
  MicOff,
  RefreshCw,
  Signal,
  SignalLow,
  TriangleAlert,
  WifiOff,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatClock, formatDateTime, integrityEventLabel, truncate } from "@/lib/format";
import { liveAttemptsQuery, timelineQuery } from "@/lib/queries";
import { integrityStatusTone } from "@/lib/status";
import type { LiveMonitoringRowDto } from "@/lib/api";

export const Route = createFileRoute("/admin/monitoring")({
  loader: ({ context }) => context.queryClient.ensureQueryData(liveAttemptsQuery()),
  component: AdminMonitoring,
});

function SignalPill({
  active,
  onIcon: OnIcon,
  offIcon: OffIcon,
  label,
}: {
  active: boolean;
  onIcon: typeof Camera;
  offIcon: typeof Camera;
  label: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex size-7 items-center justify-center rounded-md ${
        active ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"
      }`}
    >
      {active ? <OnIcon className="size-3.5" /> : <OffIcon className="size-3.5" />}
    </span>
  );
}

function AttemptTimeline({
  attemptId,
  row,
  onClose,
}: {
  attemptId: string;
  row: LiveMonitoringRowDto;
  onClose: () => void;
}) {
  const { data: events } = useSuspenseQuery(timelineQuery(attemptId));

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attempt timeline</DialogTitle>
          <DialogDescription>
            {row.studentName} · {truncate(row.assessmentTitle, 60)}
          </DialogDescription>
        </DialogHeader>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Integrity events</CardTitle>
            <CardDescription>Ordered by server receipt time.</CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded for this attempt.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((event) => (
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
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {integrityEventLabel(event.eventType)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(event.timestamp)} · severity {event.severity}
                        {event.durationSec !== undefined ? ` · ${event.durationSec}s` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

function AdminMonitoring() {
  const {
    data: attempts,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useSuspenseQuery(liveAttemptsQuery());
  const [selected, setSelected] = useState<string | null>(null);

  const selectedRow = attempts.find((attempt) => attempt.attemptId === selected) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live monitoring"
        description="Attempts currently in progress, refreshed every 10 seconds."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        }
      />

      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        Signals below are advisory indicators for human review, not proof of misconduct. Last
        updated {formatDateTime(new Date(dataUpdatedAt).toISOString())}.
      </p>

      {attempts.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No attempts in progress"
          description="Live rows appear here the moment a candidate starts a paper."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Assessment</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Signals</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead>Integrity</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempts.map((attempt) => (
                    <TableRow key={attempt.attemptId}>
                      <TableCell>
                        <Link
                          to="/admin/students/$studentId"
                          params={{ studentId: attempt.studentId }}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {attempt.studentName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{attempt.studentEmail}</p>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                        {truncate(attempt.assessmentTitle, 44)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {attempt.currentQuestion}/{attempt.totalQuestions}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatClock(attempt.remainingSec)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <SignalPill
                            active={attempt.cameraActive}
                            onIcon={Camera}
                            offIcon={CameraOff}
                            label={attempt.cameraActive ? "Camera on" : "Camera off"}
                          />
                          <SignalPill
                            active={attempt.microphoneActive}
                            onIcon={Mic}
                            offIcon={MicOff}
                            label={attempt.microphoneActive ? "Microphone on" : "Microphone off"}
                          />
                          <SignalPill
                            active={attempt.online}
                            onIcon={Signal}
                            offIcon={WifiOff}
                            label={attempt.online ? "Online" : "Offline"}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {attempt.eventCount}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={integrityStatusTone(attempt.integrityStatus)}>
                          {attempt.integrityStatus}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Open timeline"
                          onClick={() => setSelected(attempt.attemptId)}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {selected && selectedRow ? (
        <AttemptTimeline
          key={selected}
          attemptId={selected}
          row={selectedRow}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
