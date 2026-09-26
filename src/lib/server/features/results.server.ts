import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../auth";
import {
  attemptIdInputSchema,
  releaseResultInputSchema,
  resultListInputSchema,
  reviewIntegrityInputSchema,
} from "../contracts";
import { ApiError, assertCondition } from "../errors";
import { expireAttemptIfNeeded, findAttempt, getDatabase } from "../repository";
import { toResultDetail, toResultListItem } from "../serializers.server";

export const listResults = createServerFn({ method: "GET" })
  .validator(resultListInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const filter = data ?? {};
    return database.attempts
      .filter((attempt) => {
        if (attempt.status === "in_progress" || attempt.percentage === null) return false;
        if (filter.assessmentId && attempt.assessmentId !== filter.assessmentId) return false;
        if (filter.integrityStatus && attempt.integrityStatus !== filter.integrityStatus)
          return false;
        const student = database.users.find((user) => user.id === attempt.studentId);
        const assessment = database.assessments.find((item) => item.id === attempt.assessmentId);
        const search = filter.search?.toLowerCase();
        if (
          search &&
          !`${student?.name ?? ""} ${student?.email ?? ""} ${assessment?.title ?? ""}`
            .toLowerCase()
            .includes(search)
        )
          return false;
        return true;
      })
      .sort((left, right) => (right.submittedAt ?? "").localeCompare(left.submittedAt ?? ""))
      .map((attempt) => toResultListItem(database, attempt));
  });

export const getResults = listResults;

export const getResultDetail = createServerFn({ method: "GET" })
  .validator(attemptIdInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const attempt = findAttempt(database, data.attemptId);
    if (!attempt) return null;
    expireAttemptIfNeeded(database, attempt);
    assertCondition(
      attempt.status !== "in_progress",
      "NOT_SUBMITTED",
      "This attempt has not been submitted",
      409,
    );
    return toResultDetail(database, attempt);
  });

export const resultDetail = getResultDetail;

export const reviewIntegrity = createServerFn({ method: "POST" })
  .validator(reviewIntegrityInputSchema)
  .handler(async ({ data }) => {
    const { user } = await requireAdmin();
    const database = await getDatabase();
    const attempt = findAttempt(database, data.attemptId);
    if (!attempt) throw new ApiError("NOT_FOUND", "Attempt not found", 404);
    attempt.integrityStatus = data.integrityStatus;
    attempt.integrityReviewNote = data.note ?? null;
    attempt.integrityReviewedAt = new Date().toISOString();
    attempt.integrityReviewedBy = user.id;
    return {
      ok: true as const,
      attemptId: attempt.id,
      integrityStatus: attempt.integrityStatus,
      note: attempt.integrityReviewNote,
      reviewedAt: attempt.integrityReviewedAt,
      reviewedBy: attempt.integrityReviewedBy,
    };
  });

export const reviewAttemptIntegrity = reviewIntegrity;

export const releaseResult = createServerFn({ method: "POST" })
  .validator(releaseResultInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const attempt = findAttempt(database, data.attemptId);
    if (!attempt) throw new ApiError("NOT_FOUND", "Attempt not found", 404);
    assertCondition(
      attempt.status !== "in_progress",
      "NOT_SUBMITTED",
      "This attempt has not been submitted",
      409,
    );
    if (!attempt.resultReleasedAt) attempt.resultReleasedAt = new Date().toISOString();
    return { ok: true as const, attemptId: attempt.id, resultReleasedAt: attempt.resultReleasedAt };
  });

export const releaseAssessmentResults = createServerFn({ method: "POST" })
  .validator(attemptIdInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const attempt = findAttempt(database, data.attemptId);
    if (!attempt) throw new ApiError("NOT_FOUND", "Attempt not found", 404);
    const rows = database.attempts.filter(
      (item) => item.assessmentId === attempt.assessmentId && item.status !== "in_progress",
    );
    const releasedAt = new Date().toISOString();
    for (const row of rows) row.resultReleasedAt ??= releasedAt;
    return { ok: true as const, released: rows.length, releasedAt };
  });
