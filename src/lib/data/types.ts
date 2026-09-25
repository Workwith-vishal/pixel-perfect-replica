export type Role = "ADMIN" | "STUDENT";

export type Difficulty = "Easy" | "Medium" | "Hard" | "Mixed";

export type AssessmentStatus = "Draft" | "Scheduled" | "Live" | "Completed" | "Archived";

export type QuestionStatus = "Active" | "Archived";

export type NavigationMode = "free" | "sequential";

export interface SecuritySettings {
  cameraRequired: boolean;
  microphoneRequired: boolean;
  fullscreenRequired: boolean;
  detectTabSwitch: boolean;
  detectWindowBlur: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  disableBackNavigation: boolean;
  autoSubmitOnExpiry: boolean;
  warnAfterEvents: number;
  flagAfterEvents: number;
}

export interface Program {
  id: string;
  name: string;
  modules: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  program?: string;
  createdAt: string;
}

export interface QuestionStats {
  attempts: number;
  correctPct: number;
  skippedPct: number;
  avgTimeSec: number;
}

/** Full question record. Lives "server side" — never handed to the test UI as-is. */
export interface Question {
  id: string;
  program: string;
  module: string;
  topic: string;
  questionText: string;
  options: string[];
  /** Index into `options`. NEVER sent to a student's assessment screen. */
  correctOption: number;
  /** Admin-only rationale. NEVER sent to a student's assessment screen. */
  explanation: string;
  difficulty: Exclude<Difficulty, "Mixed">;
  marks: number;
  negativeMarks: number;
  tags: string[];
  status: QuestionStatus;
  createdBy: string;
  createdAt: string;
  usage: number;
  stats: QuestionStats;
}

/** The only question shape the student's browser is allowed to receive. */
export interface StudentQuestion {
  id: string;
  questionText: string;
  options: string[];
  marks: number;
  negativeMarks: number;
  topic: string;
}

export interface Assessment {
  id: string;
  title: string;
  description: string;
  program: string;
  module: string;
  difficulty: Difficulty;
  duration: number;
  questionCount: number;
  passingPercentage: number;
  maxAttempts: number;
  status: AssessmentStatus;
  navigationMode: NavigationMode;
  security: SecuritySettings;
  questionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type AttemptStatus = "in_progress" | "submitted" | "auto_submitted" | "expired";

export type IntegrityStatus = "Clean" | "Review Required" | "Flagged";

export interface AttemptAnswer {
  questionId: string;
  /** Index into the ORIGINAL option array, resolved server-side at save time. */
  selectedOption: number | null;
  answeredAt: string;
  flagged?: boolean;
}

export interface AttemptQuestionSlot {
  questionId: string;
  /** Display order of options: displayed index -> original index. */
  optionOrder: number[];
}

export interface Attempt {
  id: string;
  assessmentId: string;
  studentId: string;
  startedAt: string;
  submittedAt: string | null;
  status: AttemptStatus;
  score: number | null;
  totalMarks: number;
  percentage: number | null;
  passed: boolean | null;
  timeSpentSec: number;
  questionOrder: AttemptQuestionSlot[];
  answers: AttemptAnswer[];
  integrityStatus: IntegrityStatus;
  currentQuestionIndex: number;
  cameraActive: boolean;
  online: boolean;
}

export type IntegrityEventType =
  | "TAB_SWITCH"
  | "WINDOW_BLUR"
  | "FULLSCREEN_EXIT"
  | "CAMERA_DISABLED"
  | "MICROPHONE_DISABLED"
  | "CAMERA_STREAM_INTERRUPTED"
  | "MULTIPLE_FULLSCREEN_EXITS"
  | "NETWORK_INTERRUPTION";

export type Severity = "Low" | "Medium" | "High";

export interface IntegrityEvent {
  id: string;
  attemptId: string;
  eventType: IntegrityEventType;
  timestamp: string;
  durationSec?: number;
  severity: Severity;
  metadata?: Record<string, string | number>;
}

export interface PlatformSettings {
  organisation: string;
  supportEmail: string;
  resultsAutoRelease: boolean;
  defaultSecurity: SecuritySettings;
}
