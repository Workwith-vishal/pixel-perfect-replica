import { createServerFn } from "@tanstack/react-start";
import { requireAdmin, requireStudent, requireUser } from "../auth";
import { createStudentSchema, studentIdInputSchema } from "../contracts";
import { ApiError } from "../errors";
import {
  createStudentUser,
  findAssessment,
  findUserById,
  getDatabase,
  isEligibleForAssessment,
} from "../repository";
import {
  toProgramDto,
  toStudentAssessment,
  toStudentDetail,
  toStudentRow,
  toStudentAttemptSummary,
} from "../serializers.server";

export const listPrograms = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const database = await getDatabase();
  return database.programs.map(toProgramDto);
});

/**
 * Enrol a student. Returns the student row so the caller can insert it into
 * the list cache without a refetch.
 */
export const createStudent = createServerFn({ method: "POST" })
  .validator(createStudentSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const user = await createStudentUser(database, data);
    return toStudentRow(database, user);
  });

export const listStudents = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const database = await getDatabase();
  return database.users
    .filter((user) => user.role === "STUDENT")
    .map((user) => toStudentRow(database, user));
});

export const getStudent = createServerFn({ method: "GET" })
  .validator(studentIdInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const user = findUserById(database, data.studentId);
    if (!user || user.role !== "STUDENT") return null;
    return toStudentDetail(database, user, true);
  });

export const studentAssessments = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await requireStudent();
  const database = await getDatabase();
  return database.assessments
    .filter(
      (assessment) =>
        isEligibleForAssessment(user, assessment) &&
        (assessment.status === "Live" || assessment.status === "Scheduled"),
    )
    .map((assessment) => toStudentAssessment(database, user, assessment));
});

export const getStudentAssessments = studentAssessments;

export const getStudentResults = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await requireStudent();
  const database = await getDatabase();
  return database.attempts
    .filter((attempt) => attempt.studentId === user.id && attempt.resultReleasedAt !== null)
    .sort((left, right) => (right.submittedAt ?? "").localeCompare(left.submittedAt ?? ""))
    .map((attempt) => {
      const assessment = findAssessment(database, attempt.assessmentId);
      return {
        ...toStudentAttemptSummary(attempt, true),
        assessmentTitle: assessment?.title ?? "Assessment",
      };
    });
});

export const studentResults = getStudentResults;

export const getStudentDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await requireStudent();
  const database = await getDatabase();
  const attempts = database.attempts.filter((attempt) => attempt.studentId === user.id);
  const completed = attempts.filter((attempt) => attempt.status !== "in_progress");
  const released = completed.filter((attempt) => attempt.resultReleasedAt !== null);
  const percentages = released
    .map((attempt) => attempt.percentage)
    .filter((value): value is number => value !== null);
  return {
    availableAssessments: database.assessments.filter(
      (assessment) =>
        isEligibleForAssessment(user, assessment) &&
        (assessment.status === "Live" || assessment.status === "Scheduled"),
    ).length,
    attempts: attempts.length,
    completed: completed.length,
    inProgress: attempts.filter((attempt) => attempt.status === "in_progress").length,
    releasedResults: released.length,
    averagePercentage: percentages.length
      ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : null,
  };
});

export const getStudentProfile = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await requireStudent();
  const database = await getDatabase();
  return toStudentDetail(database, user, false);
});
