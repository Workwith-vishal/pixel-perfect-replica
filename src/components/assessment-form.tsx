import { useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createAssessment, updateAssessment } from "@/lib/api";
import type { AssessmentAdminDto, ProgramDto, QuestionListItemDto } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { fromLocalInputValue, toLocalInputValue, truncate } from "@/lib/format";

const defaultSecurity = {
  cameraRequired: true,
  microphoneRequired: false,
  fullscreenRequired: true,
  detectTabSwitch: true,
  detectWindowBlur: true,
  randomizeQuestions: true,
  randomizeOptions: true,
  disableBackNavigation: false,
  autoSubmitOnExpiry: true,
  warnAfterEvents: 1,
  flagAfterEvents: 3,
};

const statuses = ["Draft", "Scheduled", "Live", "Completed", "Archived"] as const;
const difficulties = ["Easy", "Medium", "Hard", "Mixed"] as const;
const navigationModes = [
  { value: "free", label: "Free navigation (jump to any question)" },
  { value: "sequential", label: "Sequential (next only)" },
] as const;

type AssessmentStatus = "Draft" | "Scheduled" | "Live" | "Completed" | "Archived";
type AssessmentDifficulty = "Easy" | "Medium" | "Hard" | "Mixed";
type NavigationMode = "free" | "sequential";

interface FormState {
  title: string;
  description: string;
  program: string;
  module: string;
  difficulty: AssessmentDifficulty;
  duration: number;
  passingPercentage: number;
  maxAttempts: number;
  status: AssessmentStatus;
  navigationMode: NavigationMode;
  startsAt: string;
  endsAt: string;
  questionIds: string[];
  security: typeof defaultSecurity;
}

function initialState(assessment?: AssessmentAdminDto): FormState {
  if (!assessment) {
    return {
      title: "",
      description: "",
      program: "",
      module: "",
      difficulty: "Mixed",
      duration: 45,
      passingPercentage: 40,
      maxAttempts: 2,
      status: "Draft",
      navigationMode: "free",
      startsAt: "",
      endsAt: "",
      questionIds: [],
      security: { ...defaultSecurity },
    };
  }
  return {
    title: assessment.title,
    description: assessment.description,
    program: assessment.program,
    module: assessment.module,
    difficulty: assessment.difficulty,
    duration: assessment.duration,
    passingPercentage: assessment.passingPercentage,
    maxAttempts: assessment.maxAttempts,
    status: assessment.status,
    navigationMode: assessment.navigationMode,
    startsAt: toLocalInputValue(assessment.startsAt),
    endsAt: toLocalInputValue(assessment.endsAt),
    questionIds: [...assessment.questionIds],
    security: { ...defaultSecurity, ...assessment.security },
  };
}

export function AssessmentForm({
  programs,
  questions,
  assessment,
  onSaved,
}: {
  programs: ProgramDto[];
  questions: QuestionListItemDto[];
  assessment?: AssessmentAdminDto;
  onSaved: (assessment: AssessmentAdminDto) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(assessment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modules = useMemo(() => {
    const match = programs.find((program) => program.name === form.program);
    return match?.modules ?? [];
  }, [programs, form.program]);

  const availableQuestions = useMemo(
    () =>
      questions.filter(
        (question) => question.program === form.program && question.status === "Active",
      ),
    [questions, form.program],
  );

  const selectedQuestions = useMemo(() => {
    const byId = new Map(availableQuestions.map((question) => [question.id, question]));
    return form.questionIds.flatMap((id) => {
      const question = byId.get(id);
      return question ? [question] : [];
    });
  }, [availableQuestions, form.questionIds]);

  const totalMarks = selectedQuestions.reduce((sum, question) => sum + question.marks, 0);

  const patch = (next: Partial<FormState>) => setForm((current) => ({ ...current, ...next }));

  const patchSecurity = (next: Partial<FormState["security"]>) =>
    setForm((current) => ({ ...current, security: { ...current.security, ...next } }));

  const toggleQuestion = (questionId: string) =>
    setForm((current) => ({
      ...current,
      questionIds: current.questionIds.includes(questionId)
        ? current.questionIds.filter((id) => id !== questionId)
        : [...current.questionIds, questionId],
    }));

  const selectAllVisible = () =>
    setForm((current) => ({
      ...current,
      questionIds: Array.from(
        new Set([...current.questionIds, ...availableQuestions.map((q) => q.id)]),
      ),
    }));

  const clearQuestions = () => setForm((current) => ({ ...current, questionIds: [] }));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!form.program || !form.module) {
      setError("Select a programme and module before saving.");
      return;
    }
    if (form.questionIds.length === 0) {
      setError("Add at least one question to the paper.");
      return;
    }
    if (form.questionIds.length > 200) {
      setError("A paper can hold at most 200 questions.");
      return;
    }
    if (form.security.flagAfterEvents <= form.security.warnAfterEvents) {
      setError("The flag threshold must be greater than the warning threshold.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        program: form.program,
        module: form.module,
        difficulty: form.difficulty,
        duration: Number(form.duration),
        questionCount: form.questionIds.length,
        passingPercentage: Number(form.passingPercentage),
        maxAttempts: Number(form.maxAttempts),
        status: form.status,
        navigationMode: form.navigationMode,
        security: form.security,
        questionIds: form.questionIds,
        startsAt: fromLocalInputValue(form.startsAt),
        endsAt: fromLocalInputValue(form.endsAt),
        eligiblePrograms: [form.program],
      };

      const saved = assessment
        ? await updateAssessment({ data: { assessmentId: assessment.id, ...payload } })
        : await createAssessment({ data: payload });

      toast.success(assessment ? "Assessment updated" : "Assessment created");
      onSaved(saved);
    } catch (submitError) {
      const message = errorMessage(submitError, "Could not save the assessment");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Paper details</CardTitle>
            <CardDescription>Title, scope and the window students can attempt in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder="PG — Product Strategy — Module 3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                required
                rows={3}
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="What this paper covers and how students should prepare."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="program">Programme</Label>
                <Select
                  value={form.program}
                  onValueChange={(value) => patch({ program: value, module: "", questionIds: [] })}
                >
                  <SelectTrigger id="program">
                    <SelectValue placeholder="Select programme" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={program.name}>
                        {program.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="module">Module</Label>
                <Select
                  value={form.module}
                  onValueChange={(value) => patch({ module: value })}
                  disabled={modules.length === 0}
                >
                  <SelectTrigger id="module">
                    <SelectValue placeholder="Select module" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((module) => (
                      <SelectItem key={module} value={module}>
                        {module}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startsAt">Opens at</Label>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => patch({ startsAt: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endsAt">Closes at</Label>
                <Input
                  id="endsAt"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => patch({ endsAt: event.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rules</CardTitle>
            <CardDescription>Timing, passing mark and availability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => patch({ status: value as AssessmentStatus })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select
                value={form.difficulty}
                onValueChange={(value) => patch({ difficulty: value as AssessmentDifficulty })}
              >
                <SelectTrigger id="difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {difficulties.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="navigationMode">Navigation</Label>
              <Select
                value={form.navigationMode}
                onValueChange={(value) => patch({ navigationMode: value as NavigationMode })}
              >
                <SelectTrigger id="navigationMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {navigationModes.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (min)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  max={480}
                  value={form.duration}
                  onChange={(event) => patch({ duration: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxAttempts">Max attempts</Label>
                <Input
                  id="maxAttempts"
                  type="number"
                  min={1}
                  max={20}
                  value={form.maxAttempts}
                  onChange={(event) => patch({ maxAttempts: Number(event.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="passingPercentage">Pass mark (%)</Label>
              <Input
                id="passingPercentage"
                type="number"
                min={0}
                max={100}
                value={form.passingPercentage}
                onChange={(event) => patch({ passingPercentage: Number(event.target.value) })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Question selection</CardTitle>
          <CardDescription>
            {form.program
              ? `${form.questionIds.length} selected · ${totalMarks} marks · ${availableQuestions.length} active questions in this programme`
              : "Select a programme to load its question bank."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllVisible}
              disabled={availableQuestions.length === 0}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearQuestions}
              disabled={form.questionIds.length === 0}
            >
              Clear
            </Button>
          </div>

          {form.program ? (
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {availableQuestions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No active questions in this programme. Add questions to the bank first.
                </p>
              ) : (
                availableQuestions.map((question) => {
                  const checked = form.questionIds.includes(question.id);
                  return (
                    <label
                      key={question.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-[var(--color-primary)]"
                        checked={checked}
                        onChange={() => toggleQuestion(question.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground">
                          {truncate(question.questionText, 140)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {question.module} · {question.topic} · {question.difficulty} ·{" "}
                          {question.marks} marks
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proctoring & integrity</CardTitle>
          <CardDescription>
            Signals are recorded during the attempt and surfaced to administrators for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {(
              [
                ["cameraRequired", "Require camera"],
                ["microphoneRequired", "Require microphone"],
                ["fullscreenRequired", "Require fullscreen"],
                ["detectTabSwitch", "Detect tab switches"],
                ["detectWindowBlur", "Detect window blur"],
                ["randomizeQuestions", "Randomize question order"],
                ["randomizeOptions", "Randomize option order"],
                ["disableBackNavigation", "Disable back navigation"],
                ["autoSubmitOnExpiry", "Auto-submit when time expires"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <Label htmlFor={key} className="text-sm font-normal">
                  {label}
                </Label>
                <Switch
                  id={key}
                  checked={form.security[key]}
                  onCheckedChange={(checked) => patchSecurity({ [key]: checked })}
                />
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="warnAfterEvents">Warn after events</Label>
                <Input
                  id="warnAfterEvents"
                  type="number"
                  min={0}
                  max={100}
                  value={form.security.warnAfterEvents}
                  onChange={(event) =>
                    patchSecurity({ warnAfterEvents: Number(event.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flagAfterEvents">Flag after events</Label>
                <Input
                  id="flagAfterEvents"
                  type="number"
                  min={1}
                  max={100}
                  value={form.security.flagAfterEvents}
                  onChange={(event) =>
                    patchSecurity({ flagAfterEvents: Number(event.target.value) })
                  }
                />
              </div>
            </div>
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
              Warn the candidate once {form.security.warnAfterEvents} signal
              {form.security.warnAfterEvents === 1 ? "" : "s"} are recorded; mark the attempt for
              human review after {form.security.flagAfterEvents}.
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive-soft px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {assessment ? "Save changes" : "Create assessment"}
        </Button>
      </div>
    </form>
  );
}
