import "@tanstack/react-start/server-only";

import type {
  Assessment,
  Attempt,
  AttemptAnswer,
  AttemptQuestionSlot,
  AttemptStatus,
  IntegrityEventType,
  IntegrityStatus,
  Question,
  SecuritySettings,
  Severity,
  User,
} from "../data/types";
import { secureShuffle, secureToken } from "./crypto.server";
import { ApiError, assertCondition } from "./errors";
import type {
  AttemptRecord,
  ServerDatabase,
  ServerIntegrityEvent,
  ServerUser,
} from "./models.server";
import { DEFAULT_SECURITY, INTEGRITY_ADVISORY } from "./models.server";
import { buildSeedDatabase } from "./seed";

let databasePromise: Promise<ServerDatabase> | undefined;
const eventRateWindows = new Map<string, number[]>();

export function getDatabase(): Promise<ServerDatabase> {
  if (!databasePromise) databasePromise = buildSeedDatabase();
  return databasePromise;
}

export async function resetDatabase(): Promise<ServerDatabase> {
  eventRateWindows.clear();
  databasePromise = buildSeedDatabase();
  return databasePromise;
}

export function publicUser(user: ServerUser): User {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function findUserByEmail(database: ServerDatabase, email: string): ServerUser | undefined {
  const normalized = email.trim().toLowerCase();
  return database.users.find((user) => user.email.toLowerCase() === normalized);
}

export function findUserById(database: ServerDatabase, id: string): ServerUser | undefined {
  return database.users.find((user) => user.id === id);
}

export function findQuestion(database: ServerDatabase, id: string): Question | undefined {
  return database.questions.find((question) => question.id === id);
}

export function findAssessment(database: ServerDatabase, id: string): Assessment | undefined {
  return database.assessments.find((assessment) => assessment.id === id);
}

export function findAttempt(database: ServerDatabase, id: string): AttemptRecord | undefined {
  return database.attempts.find((attempt) => attempt.id === id);
}

export function findEvents(database: ServerDatabase, attemptId: string): ServerIntegrityEvent[] {
  return database.events
    .filter((event) => event.attemptId === attemptId)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function remainingSeconds(attempt: AttemptRecord, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(attempt.deadlineAt).getTime() - now.getTime()) / 1000));
}

export function scheduleIsOpen(assessment: Assessment, now = new Date()): boolean {
  const current = now.getTime();
  if (assessment.startsAt && new Date(assessment.startsAt).getTime() > current) return false;
  if (assessment.endsAt && new Date(assessment.endsAt).getTime() <= current) return false;
  return true;
}

export function scheduleHasStarted(assessment: Assessment, now = new Date()): boolean {
  return !assessment.startsAt || new Date(assessment.startsAt).getTime() <= now.getTime();
}

export function isEligibleForAssessment(user: ServerUser, assessment: Assessment): boolean {
  if (user.role !== "STUDENT") return false;
  if (user.program !== assessment.program) return false;
  if (assessment.eligiblePrograms && !assessment.eligiblePrograms.includes(user.program))
    return false;
  return true;
}

export function canStartAssessment(
  user: ServerUser,
  assessment: Assessment,
  now = new Date(),
): boolean {
  return (
    assessment.status === "Live" &&
    scheduleIsOpen(assessment, now) &&
    isEligibleForAssessment(user, assessment) &&
    assessment.questionIds.length > 0
  );
}

export function optionId(questionId: string, originalIndex: number): string {
  return `${questionId}:option:${originalIndex}`;
}

export function originalIndexFromOptionId(questionId: string, value: string): number | undefined {
  const prefix = `${questionId}:option:`;
  if (!value.startsWith(prefix)) return undefined;
  const parsed = Number(value.slice(prefix.length));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function findSlot(
  attempt: AttemptRecord,
  questionId: string,
): AttemptQuestionSlot | undefined {
  return attempt.questionOrder.find((slot) => slot.questionId === questionId);
}

export function findAnswer(attempt: AttemptRecord, questionId: string): AttemptAnswer | undefined {
  return attempt.answers.find((answer) => answer.questionId === questionId);
}

export function findSnapshot(attempt: AttemptRecord, questionId: string) {
  return attempt.questionSnapshots.find((snapshot) => snapshot.questionId === questionId);
}

export function createAttemptRecord(
  database: ServerDatabase,
  assessment: Assessment,
  studentId: string,
  now = new Date(),
): AttemptRecord {
  const questionById = new Map(database.questions.map((question) => [question.id, question]));
  const ids = assessment.security.randomizeQuestions
    ? secureShuffle(assessment.questionIds)
    : [...assessment.questionIds];
  const order: AttemptQuestionSlot[] = ids.flatMap((questionId) => {
    const question = questionById.get(questionId);
    if (!question) return [];
    const originalOptions = question.options.map((_, index) => index);
    return [
      {
        questionId,
        optionOrder: assessment.security.randomizeOptions
          ? secureShuffle(originalOptions)
          : originalOptions,
      },
    ];
  });
  assertCondition(
    order.length === assessment.questionIds.length,
    "NO_QUESTIONS",
    "This assessment has missing or unavailable questions",
    409,
  );
  assertCondition(
    order.every((slot) => slot.optionOrder.length > 0),
    "NO_QUESTIONS",
    "This assessment has no available questions",
    409,
  );
  const startedAt = now.toISOString();
  const durationDeadline = new Date(now.getTime() + assessment.duration * 60_000).toISOString();
  const deadlineAt =
    assessment.endsAt &&
    new Date(assessment.endsAt).getTime() < new Date(durationDeadline).getTime()
      ? assessment.endsAt
      : durationDeadline;
  const snapshots = order.flatMap((slot) => {
    const question = questionById.get(slot.questionId);
    if (!question) return [];
    return [
      {
        questionId: question.id,
        questionText: question.questionText,
        options: [...question.options],
        correctOption: question.correctOption,
        explanation: question.explanation,
        topic: question.topic,
        difficulty: question.difficulty,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
      },
    ];
  });
  const attempt: AttemptRecord = {
    id: `att_${secureToken(18)}`,
    assessmentId: assessment.id,
    studentId,
    startedAt,
    submittedAt: null,
    status: "in_progress",
    score: null,
    totalMarks: snapshots.reduce((sum, snapshot) => sum + snapshot.marks, 0),
    percentage: null,
    passed: null,
    timeSpentSec: 0,
    questionOrder: order,
    answers: [],
    integrityStatus: "Clean",
    currentQuestionIndex: 0,
    cameraActive: false,
    microphoneActive: false,
    online: true,
    deadlineAt,
    questionSnapshots: snapshots,
    lastHeartbeatAt: startedAt,
    integrityReviewedAt: null,
    integrityReviewNote: null,
    integrityReviewedBy: null,
    resultReleasedAt: null,
  };
  database.attempts.unshift(attempt);
  return attempt;
}

export function deriveSeverity(eventType: IntegrityEventType): Severity {
  if (eventType === "FULLSCREEN_EXIT" || eventType === "CAMERA_STREAM_INTERRUPTED") return "High";
  if (eventType === "WINDOW_BLUR" || eventType === "TAB_SWITCH") return "Medium";
  if (eventType === "CAMERA_DISABLED" || eventType === "MICROPHONE_DISABLED") return "Medium";
  return "Low";
}

export function addIntegrityEvent(
  database: ServerDatabase,
  attempt: AttemptRecord,
  input: {
    clientEventId: string;
    eventType: IntegrityEventType;
    durationSec?: number;
    metadata?: Record<string, string | number>;
  },
  now = new Date(),
): ServerIntegrityEvent {
  const event: ServerIntegrityEvent = {
    id: `evt_${secureToken(18)}`,
    attemptId: attempt.id,
    eventType: input.eventType,
    timestamp: now.toISOString(),
    severity: deriveSeverity(input.eventType),
    ...(input.durationSec === undefined ? {} : { durationSec: input.durationSec }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    clientEventId: input.clientEventId,
    receivedAt: now.toISOString(),
  };
  database.events.push(event);
  return event;
}

export function eventCount(database: ServerDatabase, attemptId: string): number {
  return database.events.filter((event) => event.attemptId === attemptId).length;
}

export function recomputeIntegrityStatus(
  database: ServerDatabase,
  attempt: AttemptRecord,
): IntegrityStatus {
  const assessment = findAssessment(database, attempt.assessmentId);
  const count = eventCount(database, attempt.id);
  const flagAfter = assessment?.security.flagAfterEvents ?? DEFAULT_SECURITY.flagAfterEvents;
  attempt.integrityStatus =
    count >= flagAfter ? "Flagged" : count > 0 ? "Review Required" : "Clean";
  return attempt.integrityStatus;
}

export function eventClientIdExists(
  database: ServerDatabase,
  attemptId: string,
  clientEventId: string,
): boolean {
  return database.events.some(
    (event) => event.attemptId === attemptId && event.clientEventId === clientEventId,
  );
}

export function enforceEventRate(attemptId: string, count: number, now = Date.now()): void {
  const windowStart = now - 10_000;
  const timestamps = (eventRateWindows.get(attemptId) ?? []).filter(
    (timestamp) => timestamp >= windowStart,
  );
  if (timestamps.length + count > 30) {
    throw new ApiError("EVENT_RATE_LIMIT", "Too many integrity events were received", 429);
  }
  for (let index = 0; index < count; index += 1) timestamps.push(now);
  eventRateWindows.set(attemptId, timestamps);
}

export function gradeAndFinalize(
  database: ServerDatabase,
  attempt: AttemptRecord,
  status: Extract<AttemptStatus, "submitted" | "auto_submitted" | "expired">,
  now = new Date(),
): AttemptRecord {
  if (attempt.status !== "in_progress") return attempt;
  const assessment = findAssessment(database, attempt.assessmentId);
  const snapshots = new Map(
    attempt.questionSnapshots.map((snapshot) => [snapshot.questionId, snapshot]),
  );
  let rawScore = 0;
  for (const answer of attempt.answers) {
    const snapshot = snapshots.get(answer.questionId);
    if (!snapshot || answer.selectedOption === null) continue;
    rawScore +=
      answer.selectedOption === snapshot.correctOption ? snapshot.marks : -snapshot.negativeMarks;
  }
  const score = Math.max(0, rawScore);
  const totalMarks =
    attempt.totalMarks || attempt.questionSnapshots.reduce((sum, item) => sum + item.marks, 0);
  const percentage = Math.round((score / Math.max(totalMarks, 1)) * 100);
  const elapsed = Math.max(
    0,
    Math.floor((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000),
  );
  const deadlineElapsed = Math.max(
    0,
    Math.floor((new Date(attempt.deadlineAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000),
  );
  const timeCap = assessment
    ? Math.min(assessment.duration * 60, deadlineElapsed)
    : deadlineElapsed;
  attempt.score = score;
  attempt.percentage = percentage;
  attempt.passed = assessment ? percentage >= assessment.passingPercentage : false;
  attempt.timeSpentSec = assessment ? Math.min(elapsed, assessment.duration * 60) : elapsed;
  attempt.submittedAt = now.toISOString();
  attempt.status = status;
  return attempt;
}

export function expireAttemptIfNeeded(
  database: ServerDatabase,
  attempt: AttemptRecord,
  now = new Date(),
): AttemptRecord {
  if (attempt.status !== "in_progress" || new Date(attempt.deadlineAt).getTime() > now.getTime()) {
    return attempt;
  }
  const assessment = findAssessment(database, attempt.assessmentId);
  const status: Extract<AttemptStatus, "auto_submitted" | "expired"> =
    assessment?.security.autoSubmitOnExpiry === false ? "expired" : "auto_submitted";
  return gradeAndFinalize(database, attempt, status, now);
}

export function expireAttempts(database: ServerDatabase, now = new Date()): void {
  for (const attempt of database.attempts) expireAttemptIfNeeded(database, attempt, now);
}

export function advisoryText(): string {
  return INTEGRITY_ADVISORY;
}

export function studentAttempts(database: ServerDatabase, studentId: string): AttemptRecord[] {
  return database.attempts.filter((attempt) => attempt.studentId === studentId);
}

export function isSubmitted(status: AttemptStatus): boolean {
  return status !== "in_progress";
}

export function isQuestionUsable(question: Question): boolean {
  return question.status === "Active";
}

export function securityDefaults(): SecuritySettings {
  return { ...DEFAULT_SECURITY };
}
