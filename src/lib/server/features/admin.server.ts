import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../auth";
import { advisoryText, expireAttempts, getDatabase } from "../repository";

export const adminStats = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const database = await getDatabase();
  expireAttempts(database);
  const submitted = database.attempts.filter((attempt) => attempt.percentage !== null);
  const average = submitted.length
    ? Math.round(
        submitted.reduce((sum, attempt) => sum + (attempt.percentage ?? 0), 0) / submitted.length,
      )
    : 0;
  return {
    totalAssessments: database.assessments.length,
    activeAssessments: database.assessments.filter((assessment) => assessment.status === "Live")
      .length,
    attemptingNow: database.attempts.filter((attempt) => attempt.status === "in_progress").length,
    completed: submitted.length,
    averageScore: average,
    flagged: database.attempts.filter((attempt) => attempt.integrityStatus !== "Clean").length,
    totalQuestions: database.questions.length,
    students: database.users.filter((user) => user.role === "STUDENT").length,
    passRate: submitted.length
      ? Math.round((submitted.filter((attempt) => attempt.passed).length / submitted.length) * 100)
      : 0,
    avgCompletionMin: submitted.length
      ? Math.round(
          submitted.reduce((sum, attempt) => sum + attempt.timeSpentSec, 0) / submitted.length / 60,
        )
      : 0,
    integrityAdvisory: advisoryText(),
  };
});

export const getAdminDashboard = adminStats;

export const analytics = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const database = await getDatabase();
  expireAttempts(database);
  const submitted = database.attempts.filter((attempt) => attempt.percentage !== null);
  const buckets = ["0-20", "21-40", "41-60", "61-80", "81-100"];
  const distribution = buckets.map((label) => ({ label, count: 0 }));
  for (const attempt of submitted) {
    const percentage = attempt.percentage ?? 0;
    const index =
      percentage <= 20 ? 0 : percentage <= 40 ? 1 : percentage <= 60 ? 2 : percentage <= 80 ? 3 : 4;
    const bucket = distribution[index];
    if (bucket) bucket.count += 1;
  }
  const byAssessment = database.assessments
    .map((assessment) => {
      const rows = submitted.filter((attempt) => attempt.assessmentId === assessment.id);
      return {
        name: assessment.title,
        attempts: rows.length,
        avgScore: rows.length
          ? Math.round(
              rows.reduce((sum, attempt) => sum + (attempt.percentage ?? 0), 0) / rows.length,
            )
          : 0,
        avgTimeMin: rows.length
          ? Math.round(
              rows.reduce((sum, attempt) => sum + attempt.timeSpentSec, 0) / rows.length / 60,
            )
          : 0,
        completionRate: rows.length
          ? Math.round(
              (rows.filter((attempt) => attempt.status !== "expired").length / rows.length) * 100,
            )
          : 0,
      };
    })
    .filter((row) => row.attempts > 0);
  const eventCounts = new Map<string, number>();
  for (const event of database.events)
    eventCounts.set(event.eventType, (eventCounts.get(event.eventType) ?? 0) + 1);
  const questionPerformance = [...database.questions]
    .sort((left, right) => left.stats.correctPct - right.stats.correctPct)
    .map((question) => ({
      id: question.id,
      text: question.questionText,
      module: question.module,
      difficulty: question.difficulty,
      attempts: question.stats.attempts,
      correctPct: question.stats.correctPct,
      skippedPct: question.stats.skippedPct,
      avgTimeSec: question.stats.avgTimeSec,
    }));
  const difficultyMix = (["Easy", "Medium", "Hard"] as const).map((level) => {
    const questions = database.questions.filter((question) => question.difficulty === level);
    return {
      label: level,
      count: questions.length,
      avgCorrect: questions.length
        ? Math.round(
            questions.reduce((sum, question) => sum + question.stats.correctPct, 0) /
              questions.length,
          )
        : 0,
    };
  });
  return {
    distribution,
    byAssessment,
    integrityEvents: [...eventCounts.entries()].map(([label, count]) => ({ label, count })),
    questionPerformance,
    difficultyMix,
  };
});
