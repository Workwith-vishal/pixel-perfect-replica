import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flag,
  Library,
  Trophy,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { CollapsibleSection } from "@/components/collapsible-section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminStatsQuery, analyticsQuery } from "@/lib/queries";
import { formatMinutes, formatPercent, integrityEventLabel, truncate } from "@/lib/format";
import { percentTone } from "@/lib/status";

export const Route = createFileRoute("/admin/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminStatsQuery()),
      context.queryClient.ensureQueryData(analyticsQuery()),
    ]),
  component: AdminDashboard,
});

const distributionColors = ["chart-5", "chart-4", "chart-2", "chart-1", "chart-3"];

function AdminDashboard() {
  const { data: stats } = useSuspenseQuery(adminStatsQuery());
  const { data: analytics } = useSuspenseQuery(analyticsQuery());

  const weakest = analytics.questionPerformance.slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Platform-wide assessment activity, integrity posture and question performance."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Assessments"
          value={stats.totalAssessments}
          hint={`${stats.activeAssessments} live now`}
          icon={ClipboardList}
        />
        <StatCard
          label="Attempting now"
          value={stats.attemptingNow}
          hint="In-progress attempts"
          icon={Activity}
          tone="accent"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          hint={`${formatPercent(stats.passRate)} pass rate`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Average score"
          value={formatPercent(stats.averageScore)}
          hint={`${formatMinutes(stats.avgCompletionMin)} avg completion`}
          icon={Trophy}
          tone="warning"
        />
        <StatCard label="Question bank" value={stats.totalQuestions} icon={Library} />
        <StatCard
          label="Students"
          value={stats.students}
          hint="Enrolled across programmes"
          icon={Users}
        />
        <StatCard
          label="Flagged attempts"
          value={stats.flagged}
          hint="Need integrity review"
          icon={Flag}
          tone="danger"
        />
        <StatCard
          label="Avg completion"
          value={formatMinutes(stats.avgCompletionMin)}
          hint="Time students spend per paper"
          icon={Clock}
          tone="accent"
        />
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        {stats.integrityAdvisory}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <CollapsibleSection
          title="Score distribution"
          description="Submitted attempts grouped by percentage band."
          defaultOpen
        >
          {stats.completed === 0 ? (
            <EmptyState
              title="No submissions yet"
              description="Scores will appear here once students submit."
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.distribution}
                  margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--color-border)"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {analytics.distribution.map((bucket, index) => (
                      <Cell
                        key={bucket.label}
                        fill={`var(--color-${distributionColors[index] ?? "chart-1"})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Difficulty mix"
          description="Average correct rate per difficulty band."
          badge={
            <StatusBadge tone="neutral">
              {analytics.integrityEvents.reduce((sum, event) => sum + event.count, 0)} signal
              {analytics.integrityEvents.reduce((sum, event) => sum + event.count, 0) === 1
                ? ""
                : "s"}
            </StatusBadge>
          }
        >
          <div className="space-y-4">
            {analytics.difficultyMix.map((row) => (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{row.label}</span>
                  <span className="text-muted-foreground">
                    {row.count} questions · {formatPercent(row.avgCorrect)} correct
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, row.avgCorrect))}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium text-foreground">Integrity signals logged</p>
              {analytics.integrityEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No integrity events recorded yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {analytics.integrityEvents.map((event) => (
                    <li
                      key={event.label}
                      className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {integrityEventLabel(event.label)}
                      </span>
                      <span className="font-semibold text-foreground">{event.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <CollapsibleSection
        title="Assessment performance"
        description="Average score, time and completion rate per assessment."
        defaultOpen
        badge={
          <StatusBadge tone="neutral">
            {analytics.byAssessment.length} assessment
            {analytics.byAssessment.length === 1 ? "" : "s"}
          </StatusBadge>
        }
      >
        {analytics.byAssessment.length === 0 ? (
          <EmptyState title="No attempts recorded" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assessment</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Avg score</TableHead>
                  <TableHead className="text-right">Avg time</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.byAssessment.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="max-w-[280px] truncate font-medium">
                      {truncate(row.name, 60)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.attempts}</TableCell>
                    <TableCell className="text-right">
                      <StatusBadge tone={percentTone(row.avgScore)}>
                        {formatPercent(row.avgScore)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMinutes(row.avgTimeMin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatPercent(row.completionRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Hardest questions"
        description="Lowest correct rate first — use these to review question quality or difficulty tags."
        badge={<StatusBadge tone="neutral">{weakest.length} flagged</StatusBadge>}
      >
        {weakest.length === 0 ? (
          <EmptyState title="No question statistics yet" />
        ) : (
          <ul className="divide-y divide-border">
            {weakest.map((question) => (
              <li
                key={question.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {truncate(question.text, 120)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {question.module} · {question.difficulty} · {question.attempts} attempts
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={percentTone(question.correctPct)}>
                    {formatPercent(question.correctPct)} correct
                  </StatusBadge>
                  <StatusBadge tone="neutral">
                    {formatPercent(question.skippedPct)} skipped
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}
