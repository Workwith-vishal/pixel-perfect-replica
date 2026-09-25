import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { requireStudent } from "../auth";
import {
  answerInputSchema,
  assessmentIdInputSchema,
  attemptIdInputSchema,
  integrityBatchInputSchema,
  markReviewInputSchema,
  progressInputSchema,
  submitInputSchema,
} from "../contracts";
import { ApiError, assertCondition } from "../errors";
import {
  addIntegrityEvent,
  canStartAssessment,
  createAttemptRecord,
  eventClientIdExists,
  eventCount,
  expireAttemptIfNeeded,
  enforceEventRate,
  findAnswer,
  findAssessment,
  findAttempt,
  findSlot,
  findSnapshot,
  getDatabase,
  gradeAndFinalize,
  originalIndexFromOptionId,
  recomputeIntegrityStatus,
  remainingSeconds,
  studentAttempts,
} from "../repository";
import { advisoryText } from "../repository";
import { toAttemptProgress, toStudentPaper, toSubmissionReceipt } from "../serializers.server";
import type { AttemptRecord } from "../models.server";
import type { AttemptAnswer } from "../../data/types";

function ownedAttempt(attempt: AttemptRecord | undefined, studentId: string): AttemptRecord {
  assertCondition(attempt, "NOT_FOUND", "Attempt not found", 404);
  assertCondition(
    attempt.studentId === studentId,
    "FORBIDDEN",
    "You do not have access to this attempt",
    403,
  );
  return attempt;
}

function activeAttempt(
  database: Awaited<ReturnType<typeof getDatabase>>,
  attempt: AttemptRecord,
): AttemptRecord {
  expireAttemptIfNeeded(database, attempt);
  assertCondition(
    attempt.status === "in_progress",
    "ALREADY_SUBMITTED",
    "This attempt has already been submitted",
    409,
  );
  assertCondition(
    remainingSeconds(attempt) > 0,
    "TIME_EXPIRED",
    "The assessment time has expired",
    409,
  );
  return attempt;
}

export const startAttempt = createServerFn({ method: "POST" })
  .validator(assessmentIdInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    const assessment = findAssessment(database, data.assessmentId);
    if (!assessment) throw new ApiError("NOT_FOUND", "Assessment not found", 404);
    const existing = database.attempts.find(
      (attempt) =>
        attempt.assessmentId === assessment.id &&
        attempt.studentId === user.id &&
        attempt.status === "in_progress",
    );
    if (existing) {
      expireAttemptIfNeeded(database, existing);
      if (existing.status === "in_progress") {
        return {
          attemptId: existing.id,
          resumed: true,
          deadlineAt: existing.deadlineAt,
          remainingSec: remainingSeconds(existing),
        };
      }
    }
    assertCondition(
      canStartAssessment(user, assessment),
      "ASSESSMENT_UNAVAILABLE",
      "This assessment cannot be started",
      409,
    );
    const used = studentAttempts(database, user.id).filter(
      (attempt) => attempt.assessmentId === assessment.id && attempt.status !== "in_progress",
    ).length;
    assertCondition(
      used < assessment.maxAttempts,
      "ATTEMPT_LIMIT",
      "The maximum number of attempts has been reached",
      409,
    );
    const attempt = createAttemptRecord(database, assessment, user.id);
    return {
      attemptId: attempt.id,
      resumed: false,
      deadlineAt: attempt.deadlineAt,
      remainingSec: remainingSeconds(attempt),
    };
  });

export const resumeAttempt = startAttempt;

export const getStudentPaper = createServerFn({ method: "GET" })
  .validator(attemptIdInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    const attempt = ownedAttempt(findAttempt(database, data.attemptId), user.id);
    expireAttemptIfNeeded(database, attempt);
    assertCondition(
      attempt.status === "in_progress",
      "ALREADY_SUBMITTED",
      "This attempt has already been submitted",
      409,
    );
    const assessment = findAssessment(database, attempt.assessmentId);
    if (!assessment) throw new ApiError("NOT_FOUND", "Assessment not found", 404);
    return toStudentPaper(attempt, assessment);
  });

export const getAttemptPaper = getStudentPaper;

function resolveSelectedOption(
  questionId: string,
  optionOrder: number[],
  selectedOptionId: string | null | undefined,
  displayedOption: number | null | undefined,
): number | null {
  let original: number | null | undefined;
  if (selectedOptionId !== undefined) {
    if (selectedOptionId === null) original = null;
    else original = originalIndexFromOptionId(questionId, selectedOptionId);
    assertCondition(
      original !== undefined,
      "INVALID_OPTION",
      "Selected option is not valid for this question",
      422,
    );
  }
  if (displayedOption !== undefined) {
    if (displayedOption === null) {
      assertCondition(
        selectedOptionId === null || selectedOptionId === undefined,
        "INVALID_OPTION",
        "Conflicting option selection",
        422,
      );
      return null;
    }
    assertCondition(
      Number.isInteger(displayedOption) &&
        displayedOption >= 0 &&
        displayedOption < optionOrder.length,
      "INVALID_OPTION",
      "Displayed option is out of range",
      422,
    );
    const mapped = optionOrder[displayedOption];
    assertCondition(
      mapped !== undefined,
      "INVALID_OPTION",
      "Displayed option is out of range",
      422,
    );
    if (selectedOptionId !== undefined && selectedOptionId !== null)
      assertCondition(
        original === mapped,
        "INVALID_OPTION",
        "Option identifiers do not match",
        422,
      );
    return mapped;
  }
  return original ?? null;
}

export const saveAnswer = createServerFn({ method: "POST" })
  .validator(answerInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    const attempt = activeAttempt(
      database,
      ownedAttempt(findAttempt(database, data.attemptId), user.id),
    );
    const slot = findSlot(attempt, data.questionId);
    if (!slot || !findSnapshot(attempt, data.questionId))
      throw new ApiError("QUESTION_NOT_IN_ATTEMPT", "Question is not part of this attempt", 422);
    const selectedOption = resolveSelectedOption(
      data.questionId,
      slot.optionOrder,
      data.selectedOptionId,
      data.displayedOption,
    );
    const answeredAt = new Date().toISOString();
    const existing = findAnswer(attempt, data.questionId);
    if (existing) {
      existing.selectedOption = selectedOption;
      existing.answeredAt = answeredAt;
    } else {
      attempt.answers.push({
        questionId: data.questionId,
        selectedOption,
        answeredAt,
        flagged: false,
      });
    }
    return {
      ok: true as const,
      questionId: data.questionId,
      selectedOptionId:
        selectedOption === null ? null : `${data.questionId}:option:${selectedOption}`,
      displayedOption: selectedOption === null ? null : slot.optionOrder.indexOf(selectedOption),
      answeredAt,
      flagged: existing?.flagged ?? false,
    };
  });

export const setFlag = createServerFn({ method: "POST" })
  .validator(markReviewInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    const attempt = activeAttempt(
      database,
      ownedAttempt(findAttempt(database, data.attemptId), user.id),
    );
    const slot = findSlot(attempt, data.questionId);
    if (!slot)
      throw new ApiError("QUESTION_NOT_IN_ATTEMPT", "Question is not part of this attempt", 422);
    const existing = findAnswer(attempt, data.questionId);
    if (existing) existing.flagged = data.flagged;
    else
      attempt.answers.push({
        questionId: data.questionId,
        selectedOption: null,
        answeredAt: new Date().toISOString(),
        flagged: data.flagged,
      });
    return { ok: true as const, questionId: data.questionId, flagged: data.flagged };
  });

export const updateAttemptProgress = createServerFn({ method: "POST" })
  .validator(progressInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    const attempt = activeAttempt(
      database,
      ownedAttempt(findAttempt(database, data.attemptId), user.id),
    );
    if (data.currentQuestionIndex !== undefined) {
      attempt.currentQuestionIndex = Math.max(
        0,
        Math.min(data.currentQuestionIndex, attempt.questionOrder.length - 1),
      );
    }
    if (data.cameraActive !== undefined) attempt.cameraActive = data.cameraActive;
    if (data.microphoneActive !== undefined) attempt.microphoneActive = data.microphoneActive;
    if (data.online !== undefined) attempt.online = data.online;
    attempt.lastHeartbeatAt = new Date().toISOString();
    return toAttemptProgress(attempt);
  });

export const heartbeat = updateAttemptProgress;

export const logIntegrityEvent = createServerFn({ method: "POST" })
  .validator(integrityBatchInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    const attempt = activeAttempt(
      database,
      ownedAttempt(findAttempt(database, data.attemptId), user.id),
    );
    const assessment = findAssessment(database, attempt.assessmentId);
    if (!assessment) throw new ApiError("NOT_FOUND", "Assessment not found", 404);
    const enabled = (eventType: string) => {
      if (eventType === "TAB_SWITCH") return assessment.security.detectTabSwitch;
      if (eventType === "WINDOW_BLUR") return assessment.security.detectWindowBlur;
      return true;
    };
    let duplicates = 0;
    const acceptedInputs = data.events.filter((event) => {
      if (
        eventClientIdExists(database, attempt.id, event.clientEventId) ||
        !enabled(event.eventType)
      ) {
        duplicates += 1;
        return false;
      }
      return true;
    });
    enforceEventRate(attempt.id, acceptedInputs.length);
    for (const event of acceptedInputs) {
      const metadata = event.metadata
        ? Object.fromEntries(
            Object.entries(event.metadata).map(([key, value]) => [
              key,
              typeof value === "boolean" ? String(value) : value,
            ]),
          )
        : undefined;
      addIntegrityEvent(database, attempt, {
        clientEventId: event.clientEventId,
        eventType: event.eventType,
        ...(event.durationSec === undefined ? {} : { durationSec: event.durationSec }),
        ...(metadata === undefined ? {} : { metadata }),
      });
    }
    const integrityStatus = recomputeIntegrityStatus(database, attempt);
    return {
      accepted: acceptedInputs.length,
      duplicates,
      eventCount: eventCount(database, attempt.id),
      integrityStatus,
      integrityAdvisory: advisoryText(),
    };
  });

export const recordIntegrityEvents = logIntegrityEvent;

function submitOwnedAttempt(
  database: Awaited<ReturnType<typeof getDatabase>>,
  userId: string,
  attemptId: string,
  mode: "manual" | "auto",
) {
  const attempt = ownedAttempt(findAttempt(database, attemptId), userId);
  const assessment = findAssessment(database, attempt.assessmentId);
  if (!assessment) throw new ApiError("NOT_FOUND", "Assessment not found", 404);
  if (attempt.status !== "in_progress") return toSubmissionReceipt(attempt, assessment);
  expireAttemptIfNeeded(database, attempt);
  if (attempt.status !== "in_progress") return toSubmissionReceipt(attempt, assessment);
  gradeAndFinalize(database, attempt, mode === "auto" ? "auto_submitted" : "submitted");
  if (database.settings.resultsAutoRelease) attempt.resultReleasedAt = attempt.submittedAt;
  return toSubmissionReceipt(attempt, assessment);
}

export const submitAttempt = createServerFn({ method: "POST" })
  .validator(submitInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    return submitOwnedAttempt(database, user.id, data.attemptId, data.mode);
  });

export const autoSubmitAttempt = createServerFn({ method: "POST" })
  .validator(attemptIdInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    return submitOwnedAttempt(database, user.id, data.attemptId, "auto");
  });

export const getSubmissionReceipt = createServerFn({ method: "GET" })
  .validator(attemptIdInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    const attempt = ownedAttempt(findAttempt(database, data.attemptId), user.id);
    const assessment = findAssessment(database, attempt.assessmentId);
    if (!assessment) throw new ApiError("NOT_FOUND", "Assessment not found", 404);
    assertCondition(
      attempt.status !== "in_progress",
      "NOT_SUBMITTED",
      "This attempt has not been submitted",
      409,
    );
    return toSubmissionReceipt(attempt, assessment);
  });

export const getAttemptProgress = createServerFn({ method: "GET" })
  .validator(attemptIdInputSchema)
  .handler(async ({ data }) => {
    const { database, user } = await requireStudent();
    const attempt = ownedAttempt(findAttempt(database, data.attemptId), user.id);
    expireAttemptIfNeeded(database, attempt);
    return toAttemptProgress(attempt);
  });

export type StudentAttemptAnswer = AttemptAnswer;
