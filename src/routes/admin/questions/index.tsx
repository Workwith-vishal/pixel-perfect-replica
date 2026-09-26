import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Copy, Library, Pencil, Plus, Search, Upload } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuestionCsvDialog } from "@/components/question-csv-dialog";
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
import { duplicateQuestion, setQuestionStatus } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { formatPercent, truncate } from "@/lib/format";
import { programsQuery, questionsQuery } from "@/lib/queries";
import type { DifficultyFilter, QuestionStatusFilter } from "@/lib/queries";
import { difficultyTone, questionStatusTone } from "@/lib/status";

export const Route = createFileRoute("/admin/questions/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(programsQuery()),
  component: AdminQuestions,
});

const difficulties = ["all", "Easy", "Medium", "Hard"] as const;
const statuses = ["all", "Active", "Archived"] as const;

function AdminQuestions() {
  const queryClient = useQueryClient();
  const [program, setProgram] = useState("all");
  const [module, setModule] = useState("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [status, setStatus] = useState<QuestionStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const { data: programs } = useSuspenseQuery(programsQuery());

  const modules = useMemo(() => {
    const match = programs.find((item) => item.name === program);
    return match?.modules ?? [];
  }, [programs, program]);

  const filters = {
    program,
    module,
    difficulty,
    status,
    ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
  };

  const { data: questions } = useSuspenseQuery(questionsQuery(filters));

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "questions"] });
  };

  const duplicate = useMutation({
    mutationFn: async (questionId: string) => {
      await duplicateQuestion({ data: { questionId } });
    },
    onSuccess: async () => {
      toast.success("Question duplicated");
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not duplicate the question")),
  });

  const changeStatus = useMutation({
    mutationFn: async (input: { ids: string[]; status: "Active" | "Archived" }) => {
      await setQuestionStatus({ data: input });
    },
    onSuccess: async () => {
      toast.success("Question status updated");
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not update the question")),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Question bank"
        description="Author, tag and archive every question across the PG, BA and DA programmes."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setCsvOpen(true)}>
              <Upload className="size-4" />
              Import CSV
            </Button>
            <Button asChild>
              <Link to="/admin/questions/new">
                <Plus className="size-4" />
                New question
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search question text"
              className="pl-9"
              aria-label="Search questions"
            />
          </div>
          <Select
            value={program}
            onValueChange={(value) => {
              setProgram(value);
              setModule("all");
            }}
          >
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
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger aria-label="Filter by module">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={difficulty}
            onValueChange={(value) => setDifficulty(value as DifficultyFilter)}
          >
            <SelectTrigger aria-label="Filter by difficulty">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              {difficulties.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "Any difficulty" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as QuestionStatusFilter)}
          >
            <SelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "Any status" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {questions.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No questions match these filters"
          description="Widen the filters, or import a CSV to populate the bank."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Marks</TableHead>
                    <TableHead className="text-right">Correct</TableHead>
                    <TableHead className="text-right">Used in</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.map((question) => (
                    <TableRow key={question.id}>
                      <TableCell className="max-w-[380px]">
                        <Link
                          to="/admin/questions/$questionId"
                          params={{ questionId: question.id }}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {truncate(question.questionText, 90)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {question.topic} · {question.options.length} options
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {question.program}
                        <br />
                        {question.module}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {question.marks}
                        {question.negativeMarks > 0 ? (
                          <span className="block text-xs text-destructive">
                            −{question.negativeMarks}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge tone={difficultyTone(question.difficulty)}>
                          {formatPercent(question.stats.correctPct)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {question.answerCount}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={questionStatusTone(question.status)}>
                          {question.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button asChild variant="ghost" size="icon" aria-label="Edit question">
                            <Link
                              to="/admin/questions/$questionId"
                              params={{ questionId: question.id }}
                            >
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Duplicate question"
                            disabled={duplicate.isPending}
                            onClick={() => duplicate.mutate(question.id)}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={changeStatus.isPending}
                            onClick={() =>
                              changeStatus.mutate({
                                ids: [question.id],
                                status: question.status === "Active" ? "Archived" : "Active",
                              })
                            }
                          >
                            {question.status === "Active" ? "Archive" : "Activate"}
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

      <QuestionCsvDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        onImported={async () => {
          await invalidate();
        }}
      />
    </div>
  );
}
