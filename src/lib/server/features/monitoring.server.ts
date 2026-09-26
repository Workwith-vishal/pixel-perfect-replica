import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../auth";
import { attemptIdInputSchema } from "../contracts";
import { ApiError } from "../errors";
import { expireAttempts, findAttempt, getDatabase } from "../repository";
import { toIntegrityEvent, toLiveMonitoringRow } from "../serializers.server";

export const liveAttempts = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const database = await getDatabase();
  expireAttempts(database);
  return database.attempts
    .filter((attempt) => attempt.status === "in_progress")
    .map((attempt) => toLiveMonitoringRow(database, attempt));
});

export const getLiveAttempts = liveAttempts;
export const monitoring = liveAttempts;

export const attemptTimeline = createServerFn({ method: "GET" })
  .validator(attemptIdInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const attempt = findAttempt(database, data.attemptId);
    if (!attempt) throw new ApiError("NOT_FOUND", "Attempt not found", 404);
    return database.events
      .filter((event) => event.attemptId === attempt.id)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .map(toIntegrityEvent);
  });

export const getAttemptTimeline = attemptTimeline;
