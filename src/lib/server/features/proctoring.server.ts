import { createServerFn } from "@tanstack/react-start";
import { requireAdmin, requireStudent, requireUser } from "../auth";
import { proctoringArtifactInputSchema, proctoringAttemptInputSchema } from "../contracts";
import { ApiError } from "../errors";
import { findAttempt, getDatabase, isSubmitted } from "../repository";
import {
  listProctoringArtifacts,
  proctoringConfigured,
  storeProctoringArtifact,
} from "../proctoring-store.server";
import type { ProctoringArtifactDto, ProctoringStorageFailureDto } from "../dto";

/** 8 MB of decoded media per artifact. Snapshots are ~20-60 KB, clips ~200-600 KB. */
const MAX_DECODED_BYTES = 8 * 1024 * 1024;

export type ProctoringUploadResponse =
  | { status: "stored"; artifact: ProctoringArtifactDto }
  | { status: "skipped"; failure: ProctoringStorageFailureDto };

/**
 * Whether evidence capture is wired up at all. The exam UI uses this to tell the candidate up
 * front whether snapshots are being stored, instead of silently discarding them.
 */
export const proctoringStatus = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  return { configured: proctoringConfigured() };
});

/**
 * Store one snapshot or violation clip. Returns a discriminated result rather than throwing so a
 * storage outage never breaks an exam in progress — the client keeps recording integrity events
 * and retries later.
 */
export const uploadProctoringArtifact = createServerFn({ method: "POST" })
  .validator(proctoringArtifactInputSchema)
  .handler(async ({ data }): Promise<ProctoringUploadResponse> => {
    const { user } = await requireStudent();
    const attempt = findAttempt(await getDatabase(), data.attemptId);
    if (!attempt) throw new ApiError("NOT_FOUND", "Attempt not found", 404);
    if (attempt.studentId !== user.id) {
      throw new ApiError("FORBIDDEN", "This attempt belongs to another candidate", 403);
    }
    // The paper is graded from here on, so the candidate is no longer under
    // assessment. Refuse late frames rather than storing evidence for a closed
    // attempt — this is the server-side half of stopping capture on submit.
    if (isSubmitted(attempt.status)) {
      throw new ApiError(
        "ATTEMPT_CLOSED",
        "This attempt has already been submitted, so no further evidence can be recorded.",
        409,
      );
    }
    if (data.kind === "clip" && data.mimeType !== "video/webm") {
      throw new ApiError("VALIDATION", "Clips must be webm", 400);
    }
    if (data.kind === "snapshot" && data.mimeType !== "image/jpeg") {
      throw new ApiError("VALIDATION", "Snapshots must be jpeg", 400);
    }

    const bytes = new Uint8Array(Buffer.from(data.data, "base64"));
    if (bytes.byteLength === 0) {
      throw new ApiError("VALIDATION", "Empty upload", 400);
    }
    if (bytes.byteLength > MAX_DECODED_BYTES) {
      throw new ApiError("PAYLOAD_TOO_LARGE", "Recording is too large to store", 413);
    }

    const result = await storeProctoringArtifact({
      attemptId: attempt.id,
      studentId: user.id,
      assessmentId: attempt.assessmentId,
      kind: data.kind,
      reason: data.reason ?? null,
      mimeType: data.mimeType,
      bytes,
      capturedAt: data.capturedAt,
      faceCount: data.faceCount ?? null,
      attentionScore: data.attentionScore ?? null,
      metadata: data.metadata ?? {},
    });

    if (!result.ok) return { status: "skipped", failure: result.failure };
    return { status: "stored", artifact: result.artifact };
  });

/** Evidence for one attempt, newest first, with short-lived signed URLs. Admin only. */
export const listAttemptProctoringArtifacts = createServerFn({ method: "GET" })
  .validator(proctoringAttemptInputSchema)
  .handler(
    async ({
      data,
    }): Promise<
      | { status: "ok"; artifacts: ProctoringArtifactDto[] }
      | { status: "unavailable"; failure: ProctoringStorageFailureDto }
    > => {
      const admin = await requireAdmin();
      const attempt = findAttempt(await getDatabase(), data.attemptId);
      if (!attempt) throw new ApiError("NOT_FOUND", "Attempt not found", 404);

      const result = await listProctoringArtifacts(attempt.id, data.limit, {
        adminId: admin.user.id,
      });
      if (!result.ok) return { status: "unavailable", failure: result.failure };
      return { status: "ok", artifacts: result.artifacts };
    },
  );
