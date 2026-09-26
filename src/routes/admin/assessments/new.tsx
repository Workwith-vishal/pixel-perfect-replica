import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { AssessmentForm } from "@/components/assessment-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { programsQuery, questionsQuery } from "@/lib/queries";

export const Route = createFileRoute("/admin/assessments/new")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(programsQuery()),
      context.queryClient.ensureQueryData(questionsQuery()),
    ]),
  component: NewAssessmentPage,
});

function NewAssessmentPage() {
  const navigate = useNavigate();
  const { data: programs } = useSuspenseQuery(programsQuery());
  const { data: questions } = useSuspenseQuery(questionsQuery());

  return (
    <div className="space-y-6">
      <PageHeader
        title="New assessment"
        description="Build a timed paper from the question bank."
        actions={
          <Button asChild variant="outline">
            <Link to="/admin/assessments">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />
      <AssessmentForm
        programs={programs}
        questions={questions}
        onSaved={(assessment) => {
          void navigate({
            to: "/admin/assessments/$assessmentId",
            params: { assessmentId: assessment.id },
          });
        }}
      />
    </div>
  );
}
