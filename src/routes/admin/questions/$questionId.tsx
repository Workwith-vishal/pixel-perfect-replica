import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuestionForm } from "@/components/question-form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { setQuestionStatus } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { formatDate, formatPercent } from "@/lib/format";
import { programsQuery, questionsQuery } from "@/lib/queries";
import { difficultyTone, questionStatusTone } from "@/lib/status";

export const Route = createFileRoute("/admin/questions/$questionId")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(programsQuery()),
      context.queryClient.ensureQueryData(questionsQuery()),
    ]),
  component: EditQuestionPage,
});

function EditQuestionPage() {
  const { questionId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: programs } = useSuspenseQuery(programsQuery());
  const { data: questions } = useSuspenseQuery(questionsQuery());

  const question = questions.find((item) => item.id === questionId) ?? null;

  const archive = async () => {
    if (!question) return;
    try {
      await setQuestionStatus({
        data: { ids: [question.id], status: question.status === "Active" ? "Archived" : "Active" },
      });
      toast.success(question.status === "Active" ? "Question archived" : "Question reactivated");
      await queryClient.invalidateQueries({ queryKey: ["admin", "questions"] });
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the question"));
    }
  };

  if (!question) {
    return (
      <EmptyState
        title="Question not found"
        description="It may have been removed from the bank."
        action={
          <Button asChild>
            <Link to="/admin/questions">Back to question bank</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit question"
        description={`${question.program} · ${question.module} · created ${formatDate(question.createdAt)} by ${question.createdBy}`}
        actions={
          <>
            <StatusBadge tone={difficultyTone(question.difficulty)}>
              {question.difficulty}
            </StatusBadge>
            <StatusBadge tone={questionStatusTone(question.status)}>{question.status}</StatusBadge>
            <StatusBadge tone="neutral">
              {formatPercent(question.stats.correctPct)} correct
            </StatusBadge>
            <Button type="button" variant="outline" onClick={() => void archive()}>
              <Trash2 className="size-4" />
              {question.status === "Active" ? "Archive" : "Reactivate"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/questions">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </>
        }
      />
      <QuestionForm
        programs={programs}
        question={question}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ["admin", "questions"] });
        }}
      />
    </div>
  );
}
