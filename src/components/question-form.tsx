import { useMemo, useState } from "react";
import { GripVertical, Loader2, Plus, Save, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { createQuestion, updateQuestion } from "@/lib/api";
import type { ProgramDto, QuestionAdminDto } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";

const difficulties = ["Easy", "Medium", "Hard"] as const;
type QuestionDifficulty = (typeof difficulties)[number];

interface QuestionFormState {
  program: string;
  module: string;
  topic: string;
  questionText: string;
  options: string[];
  correctOption: number;
  explanation: string;
  difficulty: QuestionDifficulty;
  marks: number;
  negativeMarks: number;
  tags: string;
}

function initialState(question?: QuestionAdminDto): QuestionFormState {
  if (!question) {
    return {
      program: "",
      module: "",
      topic: "",
      questionText: "",
      options: ["", "", "", ""],
      correctOption: 0,
      explanation: "",
      difficulty: "Medium",
      marks: 4,
      negativeMarks: 1,
      tags: "",
    };
  }
  return {
    program: question.program,
    module: question.module,
    topic: question.topic,
    questionText: question.questionText,
    options: [...question.options],
    correctOption: question.correctOption,
    explanation: question.explanation,
    difficulty: question.difficulty,
    marks: question.marks,
    negativeMarks: question.negativeMarks,
    tags: question.tags.join(", "),
  };
}

export function QuestionForm({
  programs,
  question,
  onSaved,
}: {
  programs: ProgramDto[];
  question?: QuestionAdminDto;
  onSaved: (question: QuestionAdminDto) => void;
}) {
  const [form, setForm] = useState<QuestionFormState>(() => initialState(question));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modules = useMemo(() => {
    const match = programs.find((program) => program.name === form.program);
    return match?.modules ?? [];
  }, [programs, form.program]);

  const patch = (next: Partial<QuestionFormState>) =>
    setForm((current) => ({ ...current, ...next }));

  const setOption = (index: number, value: string) =>
    setForm((current) => ({
      ...current,
      options: current.options.map((option, position) => (position === index ? value : option)),
    }));

  const addOption = () =>
    setForm((current) =>
      current.options.length >= 8 ? current : { ...current, options: [...current.options, ""] },
    );

  const removeOption = (index: number) =>
    setForm((current) => {
      if (current.options.length <= 2) return current;
      const options = current.options.filter((_, position) => position !== index);
      const correctOption =
        current.correctOption === index
          ? 0
          : current.correctOption > index
            ? current.correctOption - 1
            : current.correctOption;
      return { ...current, options, correctOption };
    });

  const moveOption = (index: number, direction: -1 | 1) =>
    setForm((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.options.length) return current;
      const options = [...current.options];
      const moved = options[index];
      const swapped = options[target];
      if (moved === undefined || swapped === undefined) return current;
      options[index] = swapped;
      options[target] = moved;
      const correctOption =
        current.correctOption === index
          ? target
          : current.correctOption === target
            ? index
            : current.correctOption;
      return { ...current, options, correctOption };
    });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const options = form.options.map((option) => option.trim()).filter(Boolean);
    if (options.length < 2) {
      setError("Provide at least two answer options.");
      return;
    }
    if (form.correctOption >= options.length) {
      setError("Select which of the listed options is correct.");
      return;
    }

    const payload = {
      program: form.program,
      module: form.module,
      topic: form.topic,
      questionText: form.questionText,
      options,
      correctOption: form.correctOption,
      explanation: form.explanation,
      difficulty: form.difficulty,
      marks: Number(form.marks),
      negativeMarks: Number(form.negativeMarks),
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    setSaving(true);
    try {
      const saved = question
        ? await updateQuestion({ data: { id: question.id, ...payload } })
        : await createQuestion({ data: payload });
      toast.success(question ? "Question updated" : "Question created");
      onSaved(saved);
    } catch (submitError) {
      const message = errorMessage(submitError, "Could not save the question");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Question</CardTitle>
          <CardDescription>Prompt, classification and the answer key.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="questionText">Question text</Label>
            <Textarea
              id="questionText"
              required
              rows={3}
              value={form.questionText}
              onChange={(event) => patch({ questionText: event.target.value })}
              placeholder="State the scenario, then ask the question."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="program">Programme</Label>
              <Select
                value={form.program}
                onValueChange={(value) => patch({ program: value, module: "" })}
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
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                required
                value={form.topic}
                onChange={(event) => patch({ topic: event.target.value })}
                placeholder="e.g. Hypothesis Testing"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Options &amp; answer key</CardTitle>
          <CardDescription>
            Mark the correct option — it is stored server-side and never sent to a candidate&apos;s
            paper.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move option up"
                  disabled={index === 0}
                  onClick={() => moveOption(index, -1)}
                >
                  <GripVertical className="size-4" />
                </Button>
              </span>
              <Label
                htmlFor={`option-${index}`}
                className="w-24 shrink-0 text-sm font-normal text-muted-foreground"
              >
                Option {index + 1}
              </Label>
              <Input
                id={`option-${index}`}
                value={option}
                onChange={(event) => setOption(index, event.target.value)}
                placeholder={`Answer choice ${index + 1}`}
              />
              <Button
                type="button"
                variant={form.correctOption === index ? "default" : "outline"}
                size="sm"
                onClick={() => patch({ correctOption: index })}
              >
                {form.correctOption === index ? "Correct" : "Mark"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove option ${index + 1}`}
                disabled={form.options.length <= 2}
                onClick={() => removeOption(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
            disabled={form.options.length >= 8}
          >
            <Plus className="size-4" />
            Add option
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scoring &amp; rationale</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="difficulty">Difficulty</Label>
            <Select
              value={form.difficulty}
              onValueChange={(value) => patch({ difficulty: value as QuestionDifficulty })}
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
            <Label htmlFor="marks">Marks</Label>
            <Input
              id="marks"
              type="number"
              min={1}
              max={100}
              step="0.5"
              value={form.marks}
              onChange={(event) => patch({ marks: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="negativeMarks">Negative marks</Label>
            <Input
              id="negativeMarks"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={form.negativeMarks}
              onChange={(event) => patch({ negativeMarks: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={form.tags}
              onChange={(event) => patch({ tags: event.target.value })}
              placeholder="comma, separated"
            />
          </div>
          <div className="space-y-2 sm:col-span-4">
            <Label htmlFor="explanation">Explanation (admin only)</Label>
            <Textarea
              id="explanation"
              required
              rows={3}
              value={form.explanation}
              onChange={(event) => patch({ explanation: event.target.value })}
              placeholder="Why the answer key is correct — shown to reviewers after grading."
            />
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

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {question ? "Save changes" : "Create question"}
        </Button>
      </div>
    </form>
  );
}
