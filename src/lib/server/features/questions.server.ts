import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../auth";
import { secureToken } from "../crypto.server";
import {
  csvImportInputSchema,
  csvInputSchema,
  questionIdInputSchema,
  listQuestionsInputSchema,
  questionInputSchema,
  questionStatusBatchInputSchema,
  questionUpdateInputSchema,
  type QuestionInput,
} from "../contracts";
import { ApiError } from "../errors";
import { getDatabase, findQuestion } from "../repository";
import { toQuestionListItem } from "../serializers.server";
import { csvRowsToQuestions, validateQuestionCsv } from "../csv.server";
import type { Question } from "../../data/types";

function normalizeFilter(value: string | undefined): string | undefined {
  return value && value !== "all" ? value : undefined;
}

export const listQuestions = createServerFn({ method: "GET" })
  .validator(listQuestionsInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const filter = data ?? {};
    const program = normalizeFilter(filter.program);
    const module = normalizeFilter(filter.module);
    const topic = normalizeFilter(filter.topic);
    const difficulty = normalizeFilter(filter.difficulty);
    const status = normalizeFilter(filter.status);
    const search = normalizeFilter(filter.search)?.toLowerCase();
    return database.questions
      .filter((question) => {
        if (program && question.program !== program) return false;
        if (module && question.module !== module) return false;
        if (topic && question.topic !== topic) return false;
        if (difficulty && question.difficulty !== difficulty) return false;
        if (status && question.status !== status) return false;
        if (search && !`${question.questionText} ${question.topic}`.toLowerCase().includes(search))
          return false;
        return true;
      })
      .map((question) => toQuestionListItem(database, question));
  });

export const getQuestion = createServerFn({ method: "GET" })
  .validator(questionIdInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const question = findQuestion(database, data.questionId);
    return question ? toQuestionListItem(database, question) : null;
  });

export const getQuestionById = getQuestion;

export const createQuestion = createServerFn({ method: "POST" })
  .validator(questionInputSchema)
  .handler(async ({ data }) => {
    const { user } = await requireAdmin();
    const database = await getDatabase();
    const now = new Date().toISOString();
    const question: Question = {
      ...data,
      options: [...data.options],
      tags: [...data.tags],
      id: `q_${secureToken(12)}`,
      status: "Active",
      createdBy: user.name,
      createdAt: now,
      usage: 0,
      stats: { attempts: 0, correctPct: 0, skippedPct: 0, avgTimeSec: 0 },
    };
    database.questions.unshift(question);
    return toQuestionListItem(database, question);
  });

export const updateQuestion = createServerFn({ method: "POST" })
  .validator(questionUpdateInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const index = database.questions.findIndex((question) => question.id === data.id);
    if (index < 0) throw new ApiError("NOT_FOUND", "Question not found", 404);
    const current = database.questions[index];
    if (!current) throw new ApiError("NOT_FOUND", "Question not found", 404);
    const { id: _id, ...patch } = data;
    const merged = questionInputSchema.safeParse({
      ...current,
      ...patch,
      options: patch.options ?? current.options,
      tags: patch.tags ?? current.tags,
    });
    if (!merged.success)
      throw new ApiError(
        "VALIDATION_ERROR",
        merged.error.issues[0]?.message ?? "Invalid question",
        422,
      );
    const question: Question = {
      ...current,
      ...merged.data,
      options: [...merged.data.options],
      tags: [...merged.data.tags],
    };
    database.questions[index] = question;
    return toQuestionListItem(database, question);
  });

export const duplicateQuestion = createServerFn({ method: "POST" })
  .validator(questionIdInputSchema)
  .handler(async ({ data }) => {
    const { user } = await requireAdmin();
    const database = await getDatabase();
    const source = findQuestion(database, data.questionId);
    if (!source) throw new ApiError("NOT_FOUND", "Question not found", 404);
    const now = new Date().toISOString();
    const copy: Question = {
      ...source,
      id: `q_${secureToken(12)}`,
      questionText: `${source.questionText} (copy)`,
      options: [...source.options],
      tags: [...source.tags],
      createdBy: user.name,
      createdAt: now,
      usage: 0,
      stats: { attempts: 0, correctPct: 0, skippedPct: 0, avgTimeSec: 0 },
    };
    database.questions.unshift(copy);
    return toQuestionListItem(database, copy);
  });

export const duplicateQuestionById = duplicateQuestion;

export const setQuestionStatus = createServerFn({ method: "POST" })
  .validator(questionStatusBatchInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const ids = new Set(data.ids);
    for (const question of database.questions) {
      if (ids.has(question.id)) question.status = data.status;
    }
    return { ok: true as const, updated: data.ids.length };
  });

export const updateQuestionStatus = setQuestionStatus;

export const validateCsv = createServerFn({ method: "POST" })
  .validator(csvInputSchema)
  .handler(async ({ data }) => validateQuestionCsv(data.csv));

export const previewQuestionCsv = validateCsv;

export const importQuestions = createServerFn({ method: "POST" })
  .validator(csvImportInputSchema)
  .handler(async ({ data }) => {
    const { user } = await requireAdmin();
    const validation = validateQuestionCsv(data.csv);
    if (data.commit && !validation.valid) {
      throw new ApiError("CSV_INVALID", "CSV validation failed", 422);
    }
    const database = await getDatabase();
    let imported = 0;
    if (data.commit && validation.valid) {
      const inputs = csvRowsToQuestions(validation.rows);
      for (const input of inputs) {
        const now = new Date().toISOString();
        database.questions.unshift({
          ...input,
          options: [...input.options],
          tags: [...input.tags],
          id: `q_${secureToken(12)}`,
          status: "Active",
          createdBy: user.name,
          createdAt: now,
          usage: 0,
          stats: { attempts: 0, correctPct: 0, skippedPct: 0, avgTimeSec: 0 },
        });
        imported += 1;
      }
    }
    return { imported, validation };
  });

export const importQuestionCsv = importQuestions;

export const questionExists = async (id: string): Promise<boolean> => {
  const database = await getDatabase();
  return findQuestion(database, id) !== undefined;
};

export type CreateQuestionInput = QuestionInput;
export type UpdateQuestionPatch = QuestionPatchInput;
type QuestionPatchInput = import("../contracts").QuestionPatch;

export const assertQuestionInput = (data: unknown): QuestionInput =>
  questionInputSchema.parse(data);
