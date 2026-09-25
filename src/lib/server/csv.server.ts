import "@tanstack/react-start/server-only";

import { z } from "zod";
import type { CsvRowErrorDto, CsvValidationDto, CsvValidationRowDto } from "./dto";
import { questionInputSchema, type QuestionInput } from "./contracts";

const headerAliases: Record<string, string[]> = {
  program: ["program", "programme"],
  module: ["module", "modules"],
  topic: ["topic"],
  difficulty: ["difficulty", "level"],
  questionText: ["questiontext", "question", "text", "q"],
  options: ["options", "option", "choices"],
  correctOption: ["correctoption", "correct", "answer", "answerindex"],
  explanation: ["explanation", "rationale", "why"],
  marks: ["marks", "mark"],
  negativeMarks: ["negativemarks", "negative", "negative mark", "negative marks"],
  tags: ["tags", "tag"],
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

function columnIndexes(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  const indexes: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    const index = normalized.findIndex((header) => aliases.map(normalizeHeader).includes(header));
    if (index >= 0) indexes[field] = index;
  }
  return indexes;
}

function cell(row: string[], index: number | undefined): string {
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function parseList(value: string): string[] {
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
    } catch {
      return value.split(/\s*\|\s*/).filter(Boolean);
    }
  }
  return value
    .split(/\s*\|\s*|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value: string, field: string, row: number, errors: CsvRowErrorDto[]): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors.push({ row, field, message: "Expected a finite number" });
    return 0;
  }
  return parsed;
}

export function validateQuestionCsv(csv: string): CsvValidationDto {
  const errors: CsvRowErrorDto[] = [];
  const rows = parseCsv(csv);
  if (rows.length === 0)
    return {
      valid: false,
      rowCount: 0,
      rows: [],
      errors: [{ row: 1, field: "csv", message: "CSV is empty" }],
    };
  const headers = rows[0] ?? [];
  const indexes = columnIndexes(headers);
  for (const field of Object.keys(headerAliases)) {
    if (indexes[field] === undefined)
      errors.push({ row: 1, field, message: "Required column is missing" });
  }
  const dataRows = rows.slice(1);
  if (dataRows.length === 0)
    errors.push({ row: 1, field: "csv", message: "At least one question row is required" });
  if (dataRows.length > 2_000)
    errors.push({
      row: 2_002,
      field: "rows",
      message: "A maximum of 2,000 question rows is allowed",
    });
  const parsedRows: CsvValidationRowDto[] = [];
  for (let index = 0; index < Math.min(dataRows.length, 2_000); index += 1) {
    const source = dataRows[index] ?? [];
    const rowNumber = index + 2;
    const options = parseList(cell(source, indexes["options"]));
    const raw: Record<string, unknown> = {
      program: cell(source, indexes["program"]),
      module: cell(source, indexes["module"]),
      topic: cell(source, indexes["topic"]),
      difficulty: cell(source, indexes["difficulty"]),
      questionText: cell(source, indexes["questionText"]),
      options,
      correctOption: parseNumber(
        cell(source, indexes["correctOption"]),
        "correctOption",
        rowNumber,
        errors,
      ),
      explanation: cell(source, indexes["explanation"]),
      marks: parseNumber(cell(source, indexes["marks"]), "marks", rowNumber, errors),
      negativeMarks: parseNumber(
        cell(source, indexes["negativeMarks"]),
        "negativeMarks",
        rowNumber,
        errors,
      ),
      tags: parseList(cell(source, indexes["tags"])),
    };
    const result = questionInputSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: rowNumber,
          field: issue.path.length > 0 ? issue.path.join(".") : "row",
          message: issue.message,
        });
      }
      continue;
    }
    parsedRows.push({ row: rowNumber, ...result.data });
  }
  return { valid: errors.length === 0, rowCount: dataRows.length, rows: parsedRows, errors };
}

export function csvRowsToQuestions(rows: CsvValidationRowDto[]): QuestionInput[] {
  return rows.map((row) =>
    questionInputSchema.parse({
      program: row.program,
      module: row.module,
      topic: row.topic,
      difficulty: row.difficulty,
      questionText: row.questionText,
      options: row.options,
      correctOption: row.correctOption,
      explanation: row.explanation,
      marks: row.marks,
      negativeMarks: row.negativeMarks,
      tags: row.tags,
    }),
  );
}

export const csvQuestionSchema: z.ZodType<CsvValidationRowDto> = z.object({
  row: z.number().int().positive(),
  program: z.string(),
  module: z.string(),
  topic: z.string(),
  difficulty: z.string(),
  questionText: z.string(),
  options: z.array(z.string()),
  correctOption: z.number(),
  explanation: z.string(),
  marks: z.number(),
  negativeMarks: z.number(),
  tags: z.array(z.string()),
});
