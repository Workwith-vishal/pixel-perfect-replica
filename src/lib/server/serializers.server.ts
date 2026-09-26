import "@tanstack/react-start/server-only";

import type {
  Assessment,
  Attempt,
  IntegrityEvent,
  PlatformSettings,
  Question,
  User,
} from "../data/types";
import type {
  AssessmentInstructionsDto,
  AssessmentAdminDto,
  AttemptProgressDto,
  CsvValidationRowDto,
  LiveMonitoringRowDto,
  QuestionListItemDto,
  ResultDetailDto,
  ResultListItemDto,
  ResultQuestionDto,
  SettingsDto,
  StudentAssessmentDto,
  StudentAttemptSummaryDto,
  StudentDetailDto,
  StudentListRowDto,
  StudentPaperDto,
  StudentPaperQuestionDto,
  SubmissionReceiptDto,
  ViewerDto,
} from "./dto";
import type {
  AttemptRecord,
  ServerDatabase,
  ServerIntegrityEvent,
  ServerUser,
} from "./models.server";
import { INTEGRITY_ADVISORY } from "./models.server";
import {
  advisoryText,
  canStartAssessment,
  eventCount,
  expireAttemptIfNeeded,
  findAssessment,
  findUserById,
  isEligibleForAssessment,
  optionId,
  publicUser,
  remainingSeconds,
  scheduleHasStarted,
  scheduleIsOpen,
} from "./repository";

export function toViewerDto(user: ServerUser): ViewerDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.program === undefined ? {} : { program: user.program }),
  };
}

export function toProgramDto(program: ServerDatabase["programs"][number]) {
  return { id: program.id, name: program.name, modules: [...program.modules] };
}

function submitted(attempt: AttemptRecord): boolean {
  return attempt.status !== "in_progress";
}

function released(attempt: AttemptRecord): boolean {
  return attempt.resultReleasedAt !== null;
}

function publicAssessment(assessment: Assessment) {
  return {
    id: assessment.id,
    title: assessment.title,
    description: assessment.description,
    program: assessment.program,
    module: assessment.module,
    difficulty: assessment.difficulty,
    duration: assessment.duration,
    questionCount: assessment.questionCount,
    passingPercentage: assessment.passingPercentage,
    maxAttempts: assessment.maxAttempts,
    status: assessment.status,
    navigationMode: assessment.navigationMode,
    security: { ...assessment.security },
    questionIds: [...assessment.questionIds],
    ...(assessment.startsAt === undefined ? {} : { startsAt: assessment.startsAt }),
    ...(assessment.endsAt === undefined ? {} : { endsAt: assessment.endsAt }),
    ...(assessment.eligiblePrograms === undefined
      ? {}
      : { eligiblePrograms: [...assessment.eligiblePrograms] }),
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
  };
}

export function toAssessmentAdmin(
  database: ServerDatabase,
  assessment: Assessment,
): AssessmentAdminDto {
  const attempts = database.attempts.filter((attempt) => attempt.assessmentId === assessment.id);
  return {
    ...publicAssessment(assessment),
    attempts: attempts.length,
    activeAttempts: attempts.filter((attempt) => attempt.status === "in_progress").length,
    completedAttempts: attempts.filter((attempt) => submitted(attempt)).length,
  };
}

export function toStudentAssessment(
  database: ServerDatabase,
  user: ServerUser,
  assessment: Assessment,
  now = new Date(),
): StudentAssessmentDto {
  const mine = database.attempts
    .filter((attempt) => attempt.assessmentId === assessment.id && attempt.studentId === user.id)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  for (const attempt of mine) expireAttemptIfNeeded(database, attempt, now);
  const active = mine.find((attempt) => attempt.status === "in_progress");
  const done = mine.filter((attempt) => submitted(attempt));
  const eligible = isEligibleForAssessment(user, assessment);
  const live = canStartAssessment(user, assessment, now);
  let blockedReason: string | null = null;
  if (!eligible) blockedReason = "This assessment is not available for your programme";
  else if (active) blockedReason = "An attempt is already in progress";
  else if (done.length >= assessment.maxAttempts) blockedReason = "Maximum attempts reached";
  else if (assessment.status !== "Live") blockedReason = "This assessment is not open yet";
  else if (!scheduleHasStarted(assessment, now))
    blockedReason = "This assessment is scheduled for a future window";
  else if (!scheduleIsOpen(assessment, now)) blockedReason = "This assessment window has ended";
  return {
    id: assessment.id,
    title: assessment.title,
    description: assessment.description,
    program: assessment.program,
    module: assessment.module,
    difficulty: assessment.difficulty,
    duration: assessment.duration,
    questionCount: assessment.questionCount,
    maxAttempts: assessment.maxAttempts,
    status: assessment.status,
    attemptsUsed: done.length,
    inProgressAttemptId: active?.id ?? null,
    lastSubmittedAt: done[0]?.submittedAt ?? null,
    startsAt: assessment.startsAt ?? null,
    endsAt: assessment.endsAt ?? null,
    canStart: live && !active && done.length < assessment.maxAttempts,
    blockedReason,
    instructionsAvailable:
      eligible && (assessment.status === "Live" || assessment.status === "Scheduled"),
  };
}

export function toAssessmentInstructions(
  user: ServerUser,
  assessment: Assessment,
  now = new Date(),
): AssessmentInstructionsDto {
  const eligible = isEligibleForAssessment(user, assessment);
  return {
    assessmentId: assessment.id,
    title: assessment.title,
    description: assessment.description,
    program: assessment.program,
    module: assessment.module,
    duration: assessment.duration,
    questionCount: assessment.questionCount,
    navigationMode: assessment.navigationMode,
    security: { ...assessment.security },
    startsAt: assessment.startsAt ?? null,
    endsAt: assessment.endsAt ?? null,
    eligibility: eligible
      ? scheduleIsOpen(assessment, now)
        ? "Eligible and within the assessment window"
        : "Eligible; the assessment window is not currently open"
      : "Not eligible for your programme",
  };
}

export function toStudentPaper(
  attempt: AttemptRecord,
  assessment: Assessment,
  now = new Date(),
): StudentPaperDto {
  const questions: StudentPaperQuestionDto[] = attempt.questionOrder.map((slot) => {
    const snapshot = attempt.questionSnapshots.find(
      (question) => question.questionId === slot.questionId,
    );
    if (!snapshot) throw new Error("Attempt question snapshot is missing");
    return {
      id: snapshot.questionId,
      questionText: snapshot.questionText,
      options: slot.optionOrder.map((originalIndex) => snapshot.options[originalIndex] ?? ""),
      optionIds: slot.optionOrder.map((originalIndex) =>
        optionId(snapshot.questionId, originalIndex),
      ),
      marks: snapshot.marks,
      negativeMarks: snapshot.negativeMarks,
      topic: snapshot.topic,
    };
  });
  const savedAnswers: Record<string, string | null> = {};
  for (const question of questions) savedAnswers[question.id] = null;
  for (const answer of attempt.answers) {
    savedAnswers[answer.questionId] =
      answer.selectedOption === null ? null : optionId(answer.questionId, answer.selectedOption);
  }
  return {
    attemptId: attempt.id,
    assessment: {
      id: assessment.id,
      title: assessment.title,
      duration: assessment.duration,
      navigationMode: assessment.navigationMode,
      security: { ...assessment.security },
    },
    questions,
    savedAnswers,
    flagged: attempt.answers.filter((answer) => answer.flagged).map((answer) => answer.questionId),
    remainingSec: remainingSeconds(attempt, now),
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    integrityAdvisory: advisoryText(),
  };
}

export function toAttemptProgress(attempt: AttemptRecord, now = new Date()): AttemptProgressDto {
  return {
    ok: true,
    status: attempt.status,
    remainingSec: remainingSeconds(attempt, now),
    deadlineAt: attempt.deadlineAt,
    currentQuestionIndex: attempt.currentQuestionIndex,
    cameraActive: attempt.cameraActive,
    microphoneActive: attempt.microphoneActive,
    online: attempt.online,
  };
}

export function toSubmissionReceipt(
  attempt: AttemptRecord,
  assessment: Assessment,
): SubmissionReceiptDto {
  return {
    submissionId: attempt.id.toUpperCase(),
    submittedAt: attempt.submittedAt ?? "",
    answered: attempt.answers.filter((answer) => answer.selectedOption !== null).length,
    totalQuestions: attempt.questionOrder.length,
    assessmentTitle: assessment.title,
    autoSubmitted: attempt.status === "auto_submitted" || attempt.status === "expired",
  };
}

export function toLiveMonitoringRow(
  database: ServerDatabase,
  attempt: AttemptRecord,
  now = new Date(),
): LiveMonitoringRowDto {
  const student = findUserById(database, attempt.studentId);
  const assessment = findAssessment(database, attempt.assessmentId);
  return {
    attemptId: attempt.id,
    studentId: attempt.studentId,
    studentName: student?.name ?? "Unknown",
    studentEmail: student?.email ?? "",
    assessmentId: attempt.assessmentId,
    assessmentTitle: assessment?.title ?? "",
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    remainingSec: remainingSeconds(attempt, now),
    cameraActive: attempt.cameraActive,
    microphoneActive: attempt.microphoneActive,
    online: attempt.online,
    currentQuestion: attempt.currentQuestionIndex + 1,
    totalQuestions: attempt.questionOrder.length,
    eventCount: eventCount(database, attempt.id),
    integrityStatus: attempt.integrityStatus,
    integrityAdvisory: INTEGRITY_ADVISORY,
  };
}

export function toIntegrityEvent(event: ServerIntegrityEvent): IntegrityEvent {
  return {
    id: event.id,
    attemptId: event.attemptId,
    eventType: event.eventType,
    timestamp: event.timestamp,
    severity: event.severity,
    ...(event.durationSec === undefined ? {} : { durationSec: event.durationSec }),
    ...(event.metadata === undefined ? {} : { metadata: { ...event.metadata } }),
  };
}

function toAttempt(attempt: AttemptRecord): Attempt {
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    studentId: attempt.studentId,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    status: attempt.status,
    score: attempt.score,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    passed: attempt.passed,
    timeSpentSec: attempt.timeSpentSec,
    questionOrder: attempt.questionOrder.map((slot) => ({
      questionId: slot.questionId,
      optionOrder: [...slot.optionOrder],
    })),
    answers: attempt.answers.map((answer) => ({
      questionId: answer.questionId,
      selectedOption: answer.selectedOption,
      answeredAt: answer.answeredAt,
      ...(answer.flagged === undefined ? {} : { flagged: answer.flagged }),
    })),
    integrityStatus: attempt.integrityStatus,
    currentQuestionIndex: attempt.currentQuestionIndex,
    cameraActive: attempt.cameraActive,
    online: attempt.online,
  };
}

export function toResultListItem(
  database: ServerDatabase,
  attempt: AttemptRecord,
): ResultListItemDto {
  const student = findUserById(database, attempt.studentId);
  const assessment = findAssessment(database, attempt.assessmentId);
  return {
    attemptId: attempt.id,
    studentId: attempt.studentId,
    studentName: student?.name ?? "Unknown",
    studentEmail: student?.email ?? "",
    assessmentId: attempt.assessmentId,
    assessmentTitle: assessment?.title ?? "",
    score: attempt.score ?? 0,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage ?? 0,
    timeSpentSec: attempt.timeSpentSec,
    passed: attempt.passed ?? false,
    integrityStatus: attempt.integrityStatus,
    submittedAt: attempt.submittedAt ?? "",
    status: attempt.status,
    resultReleased: released(attempt),
  };
}

export function toStudentAttemptSummary(
  attempt: AttemptRecord,
  showResult: boolean,
): StudentAttemptSummaryDto {
  const assessmentName = attempt.assessmentId;
  return {
    attemptId: attempt.id,
    assessmentId: attempt.assessmentId,
    assessmentTitle: assessmentName,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    score: showResult ? attempt.score : null,
    totalMarks: attempt.totalMarks,
    percentage: showResult ? attempt.percentage : null,
    passed: showResult ? attempt.passed : null,
    integrityStatus: attempt.integrityStatus,
    resultReleased: released(attempt),
  };
}

export function toStudentDetail(
  database: ServerDatabase,
  user: ServerUser,
  showResults = false,
): StudentDetailDto {
  const attempts = database.attempts
    .filter((attempt) => attempt.studentId === user.id)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const completed = attempts.filter((attempt) => submitted(attempt));
  const percentages = completed
    .map((attempt) => attempt.percentage)
    .filter((value): value is number => value !== null);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    program: user.program ?? "",
    createdAt: user.createdAt,
    attempts: attempts.map((attempt) => {
      const assessment = findAssessment(database, attempt.assessmentId);
      return {
        ...toStudentAttemptSummary(attempt, showResults && released(attempt)),
        assessmentTitle: assessment?.title ?? "Assessment",
      };
    }),
    completed: completed.length,
    flagged: attempts.filter((attempt) => attempt.integrityStatus === "Flagged").length,
    averagePercentage: percentages.length
      ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : null,
  };
}

export function toResultDetail(database: ServerDatabase, attempt: AttemptRecord): ResultDetailDto {
  const assessment = findAssessment(database, attempt.assessmentId);
  if (!assessment) throw new Error("Assessment not found");
  const student = findUserById(database, attempt.studentId);
  if (!student) throw new Error("Student not found");
  const rows: ResultQuestionDto[] = attempt.questionOrder.map((slot, index) => {
    const snapshot = attempt.questionSnapshots.find((item) => item.questionId === slot.questionId);
    if (!snapshot) throw new Error("Attempt question snapshot is missing");
    const answer = attempt.answers.find((item) => item.questionId === slot.questionId);
    return {
      index: index + 1,
      questionId: snapshot.questionId,
      questionText: snapshot.questionText,
      options: [...snapshot.options],
      correctOption: snapshot.correctOption,
      selectedOption: answer?.selectedOption ?? null,
      isCorrect: answer?.selectedOption != null && answer.selectedOption === snapshot.correctOption,
      explanation: snapshot.explanation,
      topic: snapshot.topic,
      difficulty: snapshot.difficulty,
      marks: snapshot.marks,
      negativeMarks: snapshot.negativeMarks,
    };
  });
  return {
    attempt: toAttempt(attempt),
    assessment: publicAssessment(assessment),
    student: publicUser(student),
    rows,
    events: database.events
      .filter((event) => event.attemptId === attempt.id)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .map(toIntegrityEvent),
    integrityReview: {
      status: attempt.integrityStatus,
      note: attempt.integrityReviewNote,
      reviewedAt: attempt.integrityReviewedAt,
      reviewedBy: attempt.integrityReviewedBy,
    },
    integrityAdvisory: INTEGRITY_ADVISORY,
  };
}

export function toQuestionListItem(
  database: ServerDatabase,
  question: Question,
): QuestionListItemDto {
  return {
    ...question,
    options: [...question.options],
    tags: [...question.tags],
    stats: { ...question.stats },
    answerCount: database.attempts.reduce(
      (count, attempt) =>
        count + (attempt.questionOrder.some((slot) => slot.questionId === question.id) ? 1 : 0),
      0,
    ),
  };
}

export function toStudentRow(database: ServerDatabase, user: ServerUser): StudentListRowDto {
  const attempts = database.attempts.filter((attempt) => attempt.studentId === user.id);
  const completed = attempts.filter((attempt) => submitted(attempt));
  const percentages = completed
    .map((attempt) => attempt.percentage)
    .filter((value): value is number => value !== null);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    program: user.program ?? "",
    createdAt: user.createdAt,
    attempts: attempts.length,
    completed: completed.length,
    flagged: attempts.filter((attempt) => attempt.integrityStatus === "Flagged").length,
    avgPercentage: percentages.length
      ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : null,
  };
}

export function toSettings(settings: PlatformSettings): SettingsDto {
  return { ...settings, defaultSecurity: { ...settings.defaultSecurity } };
}

export function toCsvRow(row: CsvValidationRowDto): CsvValidationRowDto {
  return { ...row, options: [...row.options], tags: [...row.tags] };
}
