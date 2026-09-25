import "@tanstack/react-start/server-only";

import { z } from "zod";

import type {
  AssessmentStatus,
  AttemptStatus,
  Difficulty,
  IntegrityEventType,
  IntegrityStatus,
  NavigationMode,
  QuestionStatus,
  Role,
  Severity,
} from "../data/types";

export const roleSchema = z.enum(["ADMIN", "STUDENT"]);
export const difficultySchema = z.enum(["Easy", "Medium", "Hard", "Mixed"]);
export const questionDifficultySchema = z.enum(["Easy", "Medium", "Hard"]);
export const assessmentStatusSchema = z.enum([
  "Draft",
  "Scheduled",
  "Live",
  "Completed",
  "Archived",
]);
export const questionStatusSchema = z.enum(["Active", "Archived"]);
export const navigationModeSchema = z.enum(["free", "sequential"]);
export const attemptStatusSchema = z.enum([
  "in_progress",
  "submitted",
  "auto_submitted",
  "expired",
]);
export const integrityStatusSchema = z.enum(["Clean", "Review Required", "Flagged"]);
export const integrityEventTypeSchema = z.enum([
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "CAMERA_DISABLED",
  "MICROPHONE_DISABLED",
  "CAMERA_STREAM_INTERRUPTED",
  "MULTIPLE_FULLSCREEN_EXITS",
  "NETWORK_INTERRUPTION",
]);
export const severitySchema = z.enum(["Low", "Medium", "High"]);
export const idSchema = z.string().trim().min(1).max(160);
export const isoDateSchema = z.string().datetime({ offset: true });
export const nullableIsoDateSchema = isoDateSchema.nullable().optional();

export const securitySettingsSchema = z.object({
  cameraRequired: z.boolean(),
  microphoneRequired: z.boolean(),
  fullscreenRequired: z.boolean(),
  detectTabSwitch: z.boolean(),
  detectWindowBlur: z.boolean(),
  randomizeQuestions: z.boolean(),
  randomizeOptions: z.boolean(),
  disableBackNavigation: z.boolean(),
  autoSubmitOnExpiry: z.boolean(),
  warnAfterEvents: z.number().int().min(0).max(100),
  flagAfterEvents: z.number().int().min(1).max(100),
});

export const questionInputSchema = z
  .object({
    program: z.string().trim().min(1).max(120),
    module: z.string().trim().min(1).max(160),
    topic: z.string().trim().min(1).max(160),
    questionText: z.string().trim().min(1).max(10_000),
    options: z.array(z.string().trim().min(1).max(2_000)).min(2).max(8),
    correctOption: z.number().int().min(0),
    explanation: z.string().trim().min(1).max(10_000),
    difficulty: questionDifficultySchema,
    marks: z.number().positive().max(100),
    negativeMarks: z.number().min(0).max(100).default(0),
    tags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  })
  .superRefine((value, context) => {
    if (value.correctOption >= value.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctOption"],
        message: "Correct option is outside the supplied options",
      });
    }
  });

export const questionPatchSchema = z
  .object({
    program: z.string().trim().min(1).max(120).optional(),
    module: z.string().trim().min(1).max(160).optional(),
    topic: z.string().trim().min(1).max(160).optional(),
    questionText: z.string().trim().min(1).max(10_000).optional(),
    options: z.array(z.string().trim().min(1).max(2_000)).min(2).max(8).optional(),
    correctOption: z.number().int().min(0).optional(),
    explanation: z.string().trim().min(1).max(10_000).optional(),
    difficulty: questionDifficultySchema.optional(),
    marks: z.number().positive().max(100).optional(),
    negativeMarks: z.number().min(0).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const assessmentInputSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(5_000),
    program: z.string().trim().min(1).max(120),
    module: z.string().trim().min(1).max(160),
    difficulty: difficultySchema,
    duration: z.number().int().min(1).max(480),
    questionCount: z.number().int().min(1).max(200),
    passingPercentage: z.number().int().min(0).max(100),
    maxAttempts: z.number().int().min(1).max(20),
    status: assessmentStatusSchema,
    navigationMode: navigationModeSchema,
    security: securitySettingsSchema,
    questionIds: z.array(idSchema).min(1).max(200),
    startsAt: nullableIsoDateSchema,
    endsAt: nullableIsoDateSchema,
    eligiblePrograms: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  })
  .superRefine((value, context) => {
    if (value.questionCount !== value.questionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionCount"],
        message: "Question count must match the question list",
      });
    }
    if (value.startsAt && value.endsAt && new Date(value.startsAt) >= new Date(value.endsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Assessment end must be after its start",
      });
    }
  });

export const assessmentPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().trim().min(1).max(5_000).optional(),
    program: z.string().trim().min(1).max(120).optional(),
    module: z.string().trim().min(1).max(160).optional(),
    difficulty: difficultySchema.optional(),
    duration: z.number().int().min(1).max(480).optional(),
    questionCount: z.number().int().min(1).max(200).optional(),
    passingPercentage: z.number().int().min(0).max(100).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    status: assessmentStatusSchema.optional(),
    navigationMode: navigationModeSchema.optional(),
    security: securitySettingsSchema.partial().optional(),
    questionIds: z.array(idSchema).min(1).max(200).optional(),
    startsAt: nullableIsoDateSchema,
    endsAt: nullableIsoDateSchema,
    eligiblePrograms: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const listQuestionsInputSchema = z
  .object({
    program: z.string().trim().max(120).optional(),
    module: z.string().trim().max(160).optional(),
    topic: z.string().trim().max(160).optional(),
    difficulty: z.union([difficultySchema, z.literal("all")]).optional(),
    status: z.union([questionStatusSchema, z.literal("all")]).optional(),
    search: z.string().trim().max(240).optional(),
  })
  .optional();

export const listAssessmentsInputSchema = z
  .object({
    status: z.union([assessmentStatusSchema, z.literal("all")]).optional(),
    program: z.string().trim().max(120).optional(),
    search: z.string().trim().max(240).optional(),
  })
  .optional();

export const idInputSchema = z.object({ id: idSchema });
export const assessmentIdInputSchema = z.object({ assessmentId: idSchema });
export const attemptIdInputSchema = z.object({ attemptId: idSchema });
export const studentIdInputSchema = z.object({ studentId: idSchema });
export const assessmentUpdateInputSchema = z.intersection(
  assessmentIdInputSchema,
  assessmentPatchSchema,
);

export const loginInputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
});

export const questionIdInputSchema = z.object({ questionId: idSchema });
export const csvInputSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
});
export const csvImportInputSchema = csvInputSchema.extend({
  commit: z.boolean().default(false),
});
export const questionStatusBatchInputSchema = z.object({
  ids: z.array(idSchema).min(1).max(500),
  status: questionStatusSchema,
});
export const questionUpdateInputSchema = z.intersection(idInputSchema, questionPatchSchema);

export const answerInputSchema = z
  .object({
    attemptId: idSchema,
    questionId: idSchema,
    selectedOptionId: z.string().trim().min(1).max(240).nullable().optional(),
    displayedOption: z.number().int().min(0).max(100).nullable().optional(),
  })
  .refine(
    (value) => value.selectedOptionId !== undefined || value.displayedOption !== undefined,
    "An option or a displayed index is required",
  );

export const markReviewInputSchema = z.object({
  attemptId: idSchema,
  questionId: idSchema,
  flagged: z.boolean(),
});

export const progressInputSchema = z.object({
  attemptId: idSchema,
  currentQuestionIndex: z.number().int().min(0).max(500).optional(),
  cameraActive: z.boolean().optional(),
  microphoneActive: z.boolean().optional(),
  online: z.boolean().optional(),
});

const metadataSchema = z.record(z.union([z.string().max(500), z.number().finite(), z.boolean()]));

export const integrityBatchInputSchema = z.object({
  attemptId: idSchema,
  events: z
    .array(
      z.object({
        clientEventId: z.string().trim().min(1).max(200),
        eventType: integrityEventTypeSchema,
        durationSec: z.number().int().min(0).max(86_400).optional(),
        metadata: metadataSchema.optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const submitInputSchema = z.object({
  attemptId: idSchema,
  mode: z.enum(["manual", "auto"]).default("manual"),
});

export const resultListInputSchema = z
  .object({
    assessmentId: idSchema.optional(),
    integrityStatus: integrityStatusSchema.optional(),
    search: z.string().trim().max(240).optional(),
  })
  .optional();

export const reviewIntegrityInputSchema = z.object({
  attemptId: idSchema,
  integrityStatus: integrityStatusSchema,
  note: z.string().trim().max(2_000).optional(),
});

export const releaseResultInputSchema = z.object({
  attemptId: idSchema,
});

export const settingsPatchSchema = z
  .object({
    organisation: z.string().trim().min(1).max(160).optional(),
    supportEmail: z.string().trim().email().max(320).optional(),
    resultsAutoRelease: z.boolean().optional(),
    defaultSecurity: securitySettingsSchema.partial().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type LoginInput = z.infer<typeof loginInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuestionPatch = z.infer<typeof questionPatchSchema>;
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;
export type AssessmentPatch = z.infer<typeof assessmentPatchSchema>;
export type ListQuestionsInput = z.infer<typeof listQuestionsInputSchema>;
export type ListAssessmentsInput = z.infer<typeof listAssessmentsInputSchema>;
export type AnswerInput = z.infer<typeof answerInputSchema>;
export type MarkReviewInput = z.infer<typeof markReviewInputSchema>;
export type ProgressInput = z.infer<typeof progressInputSchema>;
export type IntegrityBatchInput = z.infer<typeof integrityBatchInputSchema>;
export type SubmitInput = z.infer<typeof submitInputSchema>;
export type ResultListInput = z.infer<typeof resultListInputSchema>;
export type ReviewIntegrityInput = z.infer<typeof reviewIntegrityInputSchema>;
export type ReleaseResultInput = z.infer<typeof releaseResultInputSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type CsvImportInput = z.infer<typeof csvImportInputSchema>;
export type ServerRole = z.infer<typeof roleSchema>;
export type ServerAssessmentStatus = z.infer<typeof assessmentStatusSchema>;
export type ServerAttemptStatus = z.infer<typeof attemptStatusSchema>;
export type ServerDifficulty = z.infer<typeof difficultySchema>;
export type ServerQuestionStatus = z.infer<typeof questionStatusSchema>;
export type ServerNavigationMode = z.infer<typeof navigationModeSchema>;
export type ServerIntegrityStatus = z.infer<typeof integrityStatusSchema>;
export type ServerIntegrityEventType = z.infer<typeof integrityEventTypeSchema>;
export type ServerSeverity = z.infer<typeof severitySchema>;
export type ServerAssessmentStatusValue = AssessmentStatus;
export type ServerAttemptStatusValue = AttemptStatus;
export type ServerDifficultyValue = Difficulty;
export type ServerQuestionStatusValue = QuestionStatus;
export type ServerNavigationModeValue = NavigationMode;
export type ServerIntegrityStatusValue = IntegrityStatus;
export type ServerIntegrityEventTypeValue = IntegrityEventType;
export type ServerSeverityValue = Severity;
export type ServerRoleValue = Role;
