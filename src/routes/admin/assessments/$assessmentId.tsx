import { Link, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { AssessmentForm } from "@/components/assessment-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { assessmentQuery, programsQuery, questionsQuery } from "@/lib/queries";
import { assessmentStatusTone } from "@/lib/status";

export const Route = createFileRoute("/admin/assessments/$assessmentId")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(programsQuery()),
      context.queryClient.ensureQueryData(questionsQuery()),
      context.queryClient.ensureQueryData(assessmentQuery(params.assessmentId)),
    ]),
  component: EditAssessmentPage,
});

function EditAssessmentPage() {
  const { assessmentId } = Route.useParams();
  const { data: programs } = useSuspenseQuery(programsQuery());
  const { data: questions } = useSuspenseQuery(questionsQuery());
  const { data: assessment } = useSuspenseQuery(assessmentQuery(assessmentId));

  if (!assessment) {
    return (
      <EmptyState
        title="Assessment not found"
        description="It may have been deleted. Return to the list to pick another paper."
        action={
          <Button asChild>
            <Link to="/admin/assessments">Back to assessments</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={assessment.title}
        description={`${assessment.program} · ${assessment.module} · updated ${new Date(assessment.updatedAt).toLocaleString("en-IN")}`}
        actions={
          <>
            <StatusBadge tone={assessmentStatusTone(assessment.status)}>
              {assessment.status}
            </StatusBadge>
            <Button asChild variant="outline">
              <Link
                to="/admin/results"
                search={{ assessmentId: assessment.id, integrityStatus: undefined }}
              >
                <ExternalLink className="size-4" />
                View results
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/assessments">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </>
        }
      />
      <AssessmentForm
        programs={programs}
        questions={questions}
        assessment={assessment}
        onSaved={() => undefined}
      />
    </div>
  );
}
