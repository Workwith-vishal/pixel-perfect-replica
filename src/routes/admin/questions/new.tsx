import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { QuestionForm } from "@/components/question-form";
import { Button } from "@/components/ui/button";
import { programsQuery } from "@/lib/queries";

export const Route = createFileRoute("/admin/questions/new")({
  loader: ({ context }) => context.queryClient.ensureQueryData(programsQuery()),
  component: NewQuestionPage,
});

function NewQuestionPage() {
  const navigate = useNavigate();
  const { data: programs } = useSuspenseQuery(programsQuery());

  return (
    <div className="space-y-6">
      <PageHeader
        title="New question"
        description="Add a single question to the shared bank."
        actions={
          <Button asChild variant="outline">
            <Link to="/admin/questions">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />
      <QuestionForm
        programs={programs}
        onSaved={(question) => {
          void navigate({
            to: "/admin/questions/$questionId",
            params: { questionId: question.id },
          });
        }}
      />
    </div>
  );
}
