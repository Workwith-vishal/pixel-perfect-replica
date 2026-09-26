import { queryOptions } from "@tanstack/react-query";

import {
  adminStats,
  analytics,
  attemptTimeline,
  getAssessment,
  getAssessmentInstructions,
  getResultDetail,
  getSettings,
  getStudent,
  getStudentDashboard,
  getStudentPaper,
  getStudentProfile,
  getStudentResults,
  listAssessments,
  listPrograms,
  listQuestions,
  listResults,
  listStudents,
  listAttemptProctoringArtifacts,
  liveAttempts,
  studentAssessments,
} from "./api";

const staleWhileLive = 5_000;

export type AssessmentStatusFilter =
  "Draft" | "Scheduled" | "Live" | "Completed" | "Archived" | "all";
export type QuestionStatusFilter = "Active" | "Archived" | "all";
export type DifficultyFilter = "Easy" | "Medium" | "Hard" | "Mixed" | "all";
export type IntegrityFilter = "Clean" | "Review Required" | "Flagged";

export type ListAssessmentsFilters = {
  status?: AssessmentStatusFilter;
  program?: string;
  search?: string;
};

export type ListQuestionsFilters = {
  program?: string;
  module?: string;
  topic?: string;
  difficulty?: DifficultyFilter;
  status?: QuestionStatusFilter;
  search?: string;
};

export type ListResultsFilters = {
  assessmentId?: string;
  integrityStatus?: IntegrityFilter;
  search?: string;
};

/* -------------------------------------------------------------------------- */
/* Admin                                                                       */
/* -------------------------------------------------------------------------- */

export function adminStatsQuery() {
  return queryOptions({
    queryKey: ["admin", "stats"] as const,
    queryFn: () => adminStats(),
    staleTime: 15_000,
  });
}

export function analyticsQuery() {
  return queryOptions({
    queryKey: ["admin", "analytics"] as const,
    queryFn: () => analytics(),
    staleTime: 30_000,
  });
}

export function programsQuery() {
  return queryOptions({
    queryKey: ["programs"] as const,
    queryFn: () => listPrograms(),
    staleTime: 300_000,
  });
}

export function assessmentsQuery(filters?: ListAssessmentsFilters) {
  return queryOptions({
    queryKey: ["admin", "assessments", filters ?? {}] as const,
    queryFn: () => listAssessments({ data: filters }),
    staleTime: 10_000,
  });
}

export function assessmentQuery(assessmentId: string) {
  return queryOptions({
    queryKey: ["admin", "assessment", assessmentId] as const,
    queryFn: () => getAssessment({ data: { assessmentId } }),
    staleTime: 10_000,
  });
}

export function questionsQuery(filters?: ListQuestionsFilters) {
  return queryOptions({
    queryKey: ["admin", "questions", filters ?? {}] as const,
    queryFn: () => listQuestions({ data: filters }),
    staleTime: 10_000,
  });
}

export function studentsQuery() {
  return queryOptions({
    queryKey: ["admin", "students"] as const,
    queryFn: () => listStudents(),
    staleTime: 15_000,
  });
}

export function studentQuery(studentId: string) {
  return queryOptions({
    queryKey: ["admin", "student", studentId] as const,
    queryFn: () => getStudent({ data: { studentId } }),
    staleTime: 10_000,
  });
}

export function liveAttemptsQuery() {
  return queryOptions({
    queryKey: ["admin", "live"] as const,
    queryFn: () => liveAttempts(),
    staleTime: staleWhileLive,
    refetchInterval: 10_000,
  });
}

export function timelineQuery(attemptId: string) {
  return queryOptions({
    queryKey: ["admin", "timeline", attemptId] as const,
    queryFn: () => attemptTimeline({ data: { attemptId } }),
    staleTime: staleWhileLive,
  });
}

export function resultsQuery(filters?: ListResultsFilters) {
  return queryOptions({
    queryKey: ["admin", "results", filters ?? {}] as const,
    queryFn: () => listResults({ data: filters }),
    staleTime: 10_000,
  });
}

export function resultDetailQuery(attemptId: string) {
  return queryOptions({
    queryKey: ["admin", "result", attemptId] as const,
    queryFn: () => getResultDetail({ data: { attemptId } }),
    staleTime: 10_000,
  });
}

/**
 * Proctoring evidence for an attempt. Signed URLs expire in minutes, so keep this uncached and
 * refetch when an administrator opens the panel.
 */
export function proctoringArtifactsQuery(attemptId: string, limit = 60) {
  return queryOptions({
    queryKey: ["admin", "proctoring", attemptId, limit] as const,
    queryFn: () => listAttemptProctoringArtifacts({ data: { attemptId, limit } }),
    staleTime: 0,
    gcTime: 60_000,
  });
}

export function settingsQuery() {
  return queryOptions({
    queryKey: ["settings"] as const,
    queryFn: () => getSettings(),
    staleTime: 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Student                                                                     */
/* -------------------------------------------------------------------------- */

export function studentDashboardQuery() {
  return queryOptions({
    queryKey: ["student", "dashboard"] as const,
    queryFn: () => getStudentDashboard(),
    staleTime: 15_000,
  });
}

export function studentAssessmentsQuery() {
  return queryOptions({
    queryKey: ["student", "assessments"] as const,
    queryFn: () => studentAssessments(),
    staleTime: staleWhileLive,
  });
}

export function studentAssessmentListQuery() {
  return queryOptions({
    queryKey: ["student", "assessment-list"] as const,
    queryFn: () => studentAssessments(),
    staleTime: staleWhileLive,
  });
}

export function assessmentInstructionsQuery(assessmentId: string) {
  return queryOptions({
    queryKey: ["student", "instructions", assessmentId] as const,
    queryFn: () => getAssessmentInstructions({ data: { assessmentId } }),
    staleTime: staleWhileLive,
  });
}

export function paperQuery(attemptId: string) {
  return queryOptions({
    queryKey: ["student", "paper", attemptId] as const,
    queryFn: () => getStudentPaper({ data: { attemptId } }),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function studentResultsQuery() {
  return queryOptions({
    queryKey: ["student", "results"] as const,
    queryFn: () => getStudentResults(),
    staleTime: 15_000,
  });
}

export function studentProfileQuery() {
  return queryOptions({
    queryKey: ["student", "profile"] as const,
    queryFn: () => getStudentProfile(),
    staleTime: 30_000,
  });
}
