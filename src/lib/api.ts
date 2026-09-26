/**
 * Client-facing barrel for every CareerVeda server function.
 *
 * The feature modules under `lib/server/features` are the only files under `lib/server` that
 * the browser bundle may import: the Start plugin rewrites them into thin RPC proxies, so
 * importing one from a route or component calls the server — never the mock database directly.
 * Everything else (repository, seed, crypto, proctoring-store) stays blocked by the
 * `importProtection.client.excludeFiles` allowlist in vite.config.ts.
 *
 * Re-exports are listed per module (rather than via `export *`) because the client build
 * cannot statically enumerate the names of a server-function module.
 */
export { adminStats, analytics } from "./server/features/admin.server";

export {
  archiveAssessment,
  assessmentCanStart,
  createAssessment,
  getAssessment,
  getAssessmentInstructions,
  listAssessments,
  updateAssessment,
} from "./server/features/assessments.server";

export {
  autoSubmitAttempt,
  getAttemptProgress,
  getStudentPaper,
  logIntegrityEvent,
  saveAnswer,
  setFlag,
  startAttempt,
  submitAttempt,
  updateAttemptProgress,
} from "./server/features/attempts.server";

export { getSession, login, logout, resetDemoData } from "./server/features/auth.server";

export { attemptTimeline, liveAttempts } from "./server/features/monitoring.server";

export {
  createQuestion,
  duplicateQuestion,
  getQuestion,
  importQuestions,
  listQuestions,
  setQuestionStatus,
  updateQuestion,
  validateCsv,
} from "./server/features/questions.server";

export {
  getResultDetail,
  listResults,
  releaseAssessmentResults,
  releaseResult,
  resultDetail,
  reviewIntegrity,
} from "./server/features/results.server";

export type { ProctoringUploadResponse } from "./server/features/proctoring.server";
export {
  listAttemptProctoringArtifacts,
  proctoringStatus,
  uploadProctoringArtifact,
} from "./server/features/proctoring.server";

export { getSettings, updateSettings } from "./server/features/settings.server";

export {
  getStudent,
  getStudentDashboard,
  getStudentProfile,
  getStudentResults,
  createStudent,
  listPrograms,
  listStudents,
  studentAssessments,
} from "./server/features/students.server";

export type {
  AdminDashboardStatsDto,
  AssessmentAdminDto,
  AssessmentInstructionsDto,
  AttemptOrderAdminDto,
  AttemptProgressDto,
  CsvRowErrorDto,
  CsvValidationDto,
  CsvValidationRowDto,
  ImportQuestionsResultDto,
  IntegrityBatchResultDto,
  LiveMonitoringRowDto,
  ProgramDto,
  ProctoringArtifactDto,
  ProctoringFailureCode,
  ProctoringStorageFailureDto,
  QuestionAdminDto,
  QuestionListItemDto,
  ResultDetailDto,
  ResultListItemDto,
  ResultQuestionDto,
  SaveAnswerResultDto,
  SettingsDto,
  StartAttemptResultDto,
  StudentAssessmentDto,
  StudentDetailDto,
  StudentListRowDto,
  StudentPaperDto,
  StudentPaperQuestionDto,
  SubmissionReceiptDto,
  ViewerDto,
} from "./server/dto";
