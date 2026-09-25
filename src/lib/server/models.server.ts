import "@tanstack/react-start/server-only";

import type {
  Assessment,
  Attempt,
  IntegrityEvent,
  PlatformSettings,
  Program,
  Question,
  User,
} from "../data/types";

export interface ServerUser extends User {
  passwordHash: string;
}

export interface AttemptQuestionSnapshot {
  questionId: string;
  questionText: string;
  options: string[];
  correctOption: number;
  explanation: string;
  topic: string;
  difficulty: string;
  marks: number;
  negativeMarks: number;
}

export interface AttemptRecord extends Attempt {
  deadlineAt: string;
  questionSnapshots: AttemptQuestionSnapshot[];
  microphoneActive: boolean;
  lastHeartbeatAt: string;
  integrityReviewedAt: string | null;
  integrityReviewNote: string | null;
  integrityReviewedBy: string | null;
  resultReleasedAt: string | null;
}

export interface ServerIntegrityEvent extends IntegrityEvent {
  clientEventId: string;
  receivedAt: string;
}

export interface ServerDatabase {
  programs: Program[];
  users: ServerUser[];
  questions: Question[];
  assessments: Assessment[];
  attempts: AttemptRecord[];
  events: ServerIntegrityEvent[];
  settings: PlatformSettings;
}

export const INTEGRITY_ADVISORY =
  "Integrity signals are advisory indicators for human review, not proof of cheating.";

export const DEFAULT_SECURITY = {
  cameraRequired: true,
  microphoneRequired: true,
  fullscreenRequired: true,
  detectTabSwitch: true,
  detectWindowBlur: true,
  randomizeQuestions: true,
  randomizeOptions: true,
  disableBackNavigation: false,
  autoSubmitOnExpiry: true,
  warnAfterEvents: 1,
  flagAfterEvents: 3,
} as const;
