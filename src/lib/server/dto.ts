import "@tanstack/react-start/server-only";

import type {
  Assessment,
  Attempt,
  AttemptQuestionSlot,
  IntegrityEvent,
  PlatformSettings,
  Question,
  SecuritySettings,
  StudentQuestion,
  User,
} from "../data/types";

export interface ViewerDto {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STUDENT";
  program?: string;
}

export interface LoginResultDto {
  viewer: ViewerDto;
}

export interface AdminDashboardStatsDto {
  totalAssessments: number;
  activeAssessments: number;
  attemptingNow: number;
  completed: number;
  averageScore: number;
  flagged: number;
  totalQuestions: number;
  students: number;
  passRate: number;
  avgCompletionMin: number;
  integrityAdvisory: string;
}

export interface ProgramDto {
  id: string;
  name: string;
  modules: string[];
}

export interface StudentListRowDto {
  id: string;
  name: string;
  email: string;
  program: string;
  createdAt: string;
  attempts: number;
  completed: number;
  flagged: number;
  avgPercentage: number | null;
}

export interface StudentAssessmentDto {
  id: string;
  title: string;
  description: string;
  program: string;
  module: string;
  difficulty: string;
  duration: number;
  questionCount: number;
  maxAttempts: number;
  status: string;
  attemptsUsed: number;
  inProgressAttemptId: string | null;
  lastSubmittedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  canStart: boolean;
  blockedReason: string | null;
  instructionsAvailable: boolean;
}

export interface AssessmentInstructionsDto {
  assessmentId: string;
  title: string;
  description: string;
  program: string;
  module: string;
  duration: number;
  questionCount: number;
  navigationMode: string;
  security: SecuritySettings;
  startsAt: string | null;
  endsAt: string | null;
  eligibility: string;
}

export interface StudentPaperQuestionDto extends StudentQuestion {
  optionIds: string[];
}

export interface StudentPaperDto {
  attemptId: string;
  assessment: {
    id: string;
    title: string;
    duration: number;
    navigationMode: string;
    security: SecuritySettings;
  };
  questions: StudentPaperQuestionDto[];
  savedAnswers: Record<string, string | null>;
  flagged: string[];
  remainingSec: number;
  startedAt: string;
  deadlineAt: string;
  integrityAdvisory: string;
}

export interface SaveAnswerResultDto {
  ok: true;
  questionId: string;
  selectedOptionId: string | null;
  displayedOption: number | null;
  answeredAt: string;
  flagged: boolean;
}

export interface MarkReviewResultDto {
  ok: true;
  questionId: string;
  flagged: boolean;
}

export interface AttemptProgressDto {
  ok: true;
  status: string;
  remainingSec: number;
  deadlineAt: string;
  currentQuestionIndex: number;
  cameraActive: boolean;
  microphoneActive: boolean;
  online: boolean;
}

export interface IntegrityBatchResultDto {
  accepted: number;
  duplicates: number;
  eventCount: number;
  integrityStatus: string;
  integrityAdvisory: string;
}

export interface SubmissionReceiptDto {
  submissionId: string;
  submittedAt: string;
  answered: number;
  totalQuestions: number;
  assessmentTitle: string;
  autoSubmitted: boolean;
}

export interface StartAttemptResultDto {
  attemptId: string;
  resumed: boolean;
  deadlineAt: string;
  remainingSec: number;
}

export interface LiveMonitoringRowDto {
  attemptId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  assessmentId: string;
  assessmentTitle: string;
  startedAt: string;
  deadlineAt: string;
  remainingSec: number;
  cameraActive: boolean;
  microphoneActive: boolean;
  online: boolean;
  currentQuestion: number;
  totalQuestions: number;
  eventCount: number;
  integrityStatus: string;
  integrityAdvisory: string;
}

export interface ResultListItemDto {
  attemptId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  assessmentId: string;
  assessmentTitle: string;
  score: number;
  totalMarks: number;
  percentage: number;
  timeSpentSec: number;
  passed: boolean;
  integrityStatus: string;
  submittedAt: string;
  status: string;
  resultReleased: boolean;
}

export interface QuestionAdminDto extends Question {
  correctOption: number;
  explanation: string;
}

export interface AssessmentAdminDto extends Assessment {
  questionCount: number;
  attempts: number;
  activeAttempts: number;
  completedAttempts: number;
}

export interface StudentAttemptSummaryDto {
  attemptId: string;
  assessmentId: string;
  assessmentTitle: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  totalMarks: number;
  percentage: number | null;
  passed: boolean | null;
  integrityStatus: string;
  resultReleased: boolean;
}

export interface StudentDetailDto {
  id: string;
  name: string;
  email: string;
  program: string;
  createdAt: string;
  attempts: StudentAttemptSummaryDto[];
  completed: number;
  flagged: number;
  averagePercentage: number | null;
}

export interface ResultQuestionDto {
  index: number;
  questionId: string;
  questionText: string;
  options: string[];
  correctOption: number;
  selectedOption: number | null;
  isCorrect: boolean;
  explanation: string;
  topic: string;
  difficulty: string;
  marks: number;
  negativeMarks: number;
}

export interface ResultDetailDto {
  attempt: Attempt;
  assessment: Assessment;
  student: User;
  rows: ResultQuestionDto[];
  events: IntegrityEvent[];
  integrityReview: {
    status: string;
    note: string | null;
    reviewedAt: string | null;
    reviewedBy: string | null;
  };
  integrityAdvisory: string;
}

export interface QuestionListItemDto extends QuestionAdminDto {
  answerCount: number;
}

export interface CsvRowErrorDto {
  row: number;
  field: string;
  message: string;
}

export interface CsvValidationRowDto {
  row: number;
  program: string;
  module: string;
  topic: string;
  difficulty: string;
  questionText: string;
  options: string[];
  correctOption: number;
  explanation: string;
  marks: number;
  negativeMarks: number;
  tags: string[];
}

export interface CsvValidationDto {
  valid: boolean;
  rowCount: number;
  rows: CsvValidationRowDto[];
  errors: CsvRowErrorDto[];
}

export interface ImportQuestionsResultDto {
  imported: number;
  validation: CsvValidationDto;
}

export interface AttemptOrderAdminDto extends AttemptQuestionSlot {
  questionId: string;
}

export type SettingsDto = PlatformSettings;

export type ProctoringArtifactKind = "snapshot" | "clip";

export type ProctoringFailureCode =
  "not_configured" | "missing_table" | "upload_failed" | "read_failed";

export interface ProctoringStorageFailureDto {
  code: ProctoringFailureCode;
  message: string;
  hint?: string;
}

/** One stored frame or clip, with a short-lived signed URL for private review. */
export interface ProctoringArtifactDto {
  id: string;
  attemptId: string;
  studentId: string;
  assessmentId: string | null;
  kind: ProctoringArtifactKind;
  reason: string | null;
  mimeType: string;
  byteSize: number;
  capturedAt: string;
  faceCount: number | null;
  attentionScore: number | null;
  url: string | null;
}
