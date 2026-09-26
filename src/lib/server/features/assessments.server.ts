import { createServerFn } from "@tanstack/react-start";
import { requireAdmin, requireStudent } from "../auth";
import { secureToken } from "../crypto.server";
import {
  assessmentInputSchema,
  assessmentUpdateInputSchema,
  assessmentIdInputSchema,
  listAssessmentsInputSchema,
  type AssessmentInput,
} from "../contracts";
import { ApiError } from "../errors";
import {
  canStartAssessment,
  findAssessment,
  findQuestion,
  getDatabase,
  isEligibleForAssessment,
  scheduleHasStarted,
  scheduleIsOpen,
} from "../repository";
import {
  toAssessmentAdmin,
  toAssessmentInstructions,
  toStudentAssessment,
} from "../serializers.server";
import type { Assessment, SecuritySettings } from "../../data/types";

function validateQuestionIds(
  database: Awaited<ReturnType<typeof getDatabase>>,
  questionIds: string[],
): void {
  const unique = new Set(questionIds);
  if (unique.size !== questionIds.length)
    throw new ApiError("DUPLICATE_QUESTION", "Question IDs must be unique", 422);
  for (const id of questionIds) {
    const question = findQuestion(database, id);
    if (!question) throw new ApiError("QUESTION_NOT_FOUND", `Question ${id} was not found`, 422);
  }
}

function validateSchedule(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): void {
  if (startsAt && endsAt && new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    throw new ApiError("INVALID_SCHEDULE", "Assessment end must be after its start", 422);
  }
}

function withOptionalDates<T extends object>(
  value: T,
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): T & { startsAt?: string; endsAt?: string } {
  const result = { ...value } as T & { startsAt?: string; endsAt?: string };
  if (startsAt === null) delete result.startsAt;
  else if (startsAt !== undefined) result.startsAt = startsAt;
  if (endsAt === null) delete result.endsAt;
  else if (endsAt !== undefined) result.endsAt = endsAt;
  return result;
}

export const listAssessments = createServerFn({ method: "GET" })
  .validator(listAssessmentsInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const filter = data ?? {};
    return database.assessments
      .filter((assessment) => {
        if (filter.status && filter.status !== "all" && assessment.status !== filter.status)
          return false;
        if (filter.program && filter.program !== "all" && assessment.program !== filter.program)
          return false;
        if (
          filter.search &&
          !`${assessment.title} ${assessment.description}`
            .toLowerCase()
            .includes(filter.search.toLowerCase())
        )
          return false;
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((assessment) => toAssessmentAdmin(database, assessment));
  });

export const getAssessment = createServerFn({ method: "GET" })
  .validator(assessmentIdInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const assessment = findAssessment(database, data.assessmentId);
    return assessment ? toAssessmentAdmin(database, assessment) : null;
  });

export const getAssessmentById = getAssessment;

export const createAssessment = createServerFn({ method: "POST" })
  .validator(assessmentInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    validateQuestionIds(database, data.questionIds);
    validateSchedule(data.startsAt, data.endsAt);
    const now = new Date().toISOString();
    const assessment = withOptionalDates(
      {
        ...data,
        id: `asmt_${secureToken(12)}`,
        security: { ...data.security } as SecuritySettings,
        questionIds: [...data.questionIds],
        createdAt: now,
        updatedAt: now,
      },
      data.startsAt,
      data.endsAt,
    ) as Assessment;
    database.assessments.unshift(assessment);
    return toAssessmentAdmin(database, assessment);
  });

export const updateAssessment = createServerFn({ method: "POST" })
  .validator(assessmentUpdateInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const index = database.assessments.findIndex(
      (assessment) => assessment.id === data.assessmentId,
    );
    if (index < 0) throw new ApiError("NOT_FOUND", "Assessment not found", 404);
    const current = database.assessments[index];
    if (!current) throw new ApiError("NOT_FOUND", "Assessment not found", 404);
    const nextQuestionIds = data.questionIds ?? current.questionIds;
    validateQuestionIds(database, nextQuestionIds);
    const nextQuestionCount = data.questionCount ?? nextQuestionIds.length;
    if (nextQuestionCount !== nextQuestionIds.length) {
      throw new ApiError(
        "QUESTION_COUNT_MISMATCH",
        "Question count must match the question list",
        422,
      );
    }
    const { assessmentId: _assessmentId, ...patch } = data;
    const nextStartsAt = data.startsAt === undefined ? current.startsAt : data.startsAt;
    const nextEndsAt = data.endsAt === undefined ? current.endsAt : data.endsAt;
    validateSchedule(nextStartsAt, nextEndsAt);
    const nextSecurity: SecuritySettings = { ...current.security };
    if (patch.security) {
      for (const [key, value] of Object.entries(patch.security)) {
        if (value !== undefined) Object.assign(nextSecurity, { [key]: value });
      }
    }
    const updated = withOptionalDates(
      {
        ...current,
        ...patch,
        questionIds: [...nextQuestionIds],
        questionCount: nextQuestionCount,
        security: nextSecurity,
        updatedAt: new Date().toISOString(),
      },
      nextStartsAt,
      nextEndsAt,
    ) as Assessment;
    database.assessments[index] = updated;
    return toAssessmentAdmin(database, updated);
  });

export const updateAssessmentById = updateAssessment;

export const archiveAssessment = createServerFn({ method: "POST" })
  .validator(assessmentIdInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const assessment = findAssessment(database, data.assessmentId);
    if (!assessment) throw new ApiError("NOT_FOUND", "Assessment not found", 404);
    assessment.status = "Archived";
    assessment.updatedAt = new Date().toISOString();
    return toAssessmentAdmin(database, assessment);
  });

export const getAssessmentInstructions = createServerFn({ method: "GET" })
  .validator(assessmentIdInputSchema)
  .handler(async ({ data }) => {
    const { user } = await requireStudent();
    const database = await getDatabase();
    const assessment = findAssessment(database, data.assessmentId);
    if (!assessment) return null;
    if (!isEligibleForAssessment(user, assessment)) return null;
    return toAssessmentInstructions(user, assessment);
  });

export const assessmentCanStart = createServerFn({ method: "GET" })
  .validator(assessmentIdInputSchema)
  .handler(async ({ data }) => {
    const { user } = await requireStudent();
    const database = await getDatabase();
    const assessment = findAssessment(database, data.assessmentId);
    if (!assessment) return { canStart: false, reason: "Assessment not found" };
    const canStart = canStartAssessment(user, assessment);
    const reason = !isEligibleForAssessment(user, assessment)
      ? "Assessment is not available for your programme"
      : assessment.status !== "Live"
        ? "Assessment is not open yet"
        : !scheduleHasStarted(assessment)
          ? "Assessment is scheduled for a future window"
          : !scheduleIsOpen(assessment)
            ? "Assessment window has ended"
            : !canStart
              ? "Assessment cannot be started"
              : null;
    return { canStart, reason };
  });

export const listStudentAssessments = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await requireStudent();
  const database = await getDatabase();
  return database.assessments
    .filter(
      (assessment) =>
        isEligibleForAssessment(user, assessment) &&
        (assessment.status === "Live" || assessment.status === "Scheduled"),
    )
    .map((assessment) => toStudentAssessment(database, user, assessment));
});

export type NewAssessmentInput = AssessmentInput;
