import "@tanstack/react-start/server-only";

import { RAW_QUESTIONS } from "../data/questions.seed";
import type {
  Assessment,
  AssessmentStatus,
  AttemptAnswer,
  AttemptQuestionSlot,
  AttemptStatus,
  Difficulty,
  IntegrityEventType,
  IntegrityStatus,
  Question,
  SecuritySettings,
  Severity,
} from "../data/types";
import { hashPassword, secureToken } from "./crypto.server";
import type {
  AttemptRecord,
  ServerDatabase,
  ServerIntegrityEvent,
  ServerUser,
} from "./models.server";
import { DEFAULT_SECURITY } from "./models.server";

export const PM_MODULES = [
  "Preparatory Foundation",
  "Product Thinking & Customer Obsession",
  "Market Research & Competitive Intelligence",
  "User Research & Product Discovery",
  "Product Strategy & Vision Development",
  "Product Requirements & Roadmap Management",
  "UX, Wireframing & Product Design",
  "Agile Product Development",
  "Product Analytics & Decision Science",
  "AI for Product Managers",
  "Product Growth & GTM Strategy",
  "Product Leadership & Stakeholder Management",
  "Capstone Project",
];

const BA_MODULES = [
  "Business Metrics & KPIs",
  "Data Visualisation & Storytelling",
  "Statistics for Business Decisions",
  "Forecasting & Planning",
];

const DA_MODULES = [
  "SQL for Analytics",
  "Data Cleaning & Preparation",
  "Dashboarding & Reporting",
  "Experimentation & Causal Analysis",
];

const STUDENT_NAMES = [
  "Aarav Sharma",
  "Priya Verma",
  "Rahul Singh",
  "Ananya Gupta",
  "Aditya Kumar",
  "Ishita Nair",
  "Karthik Iyer",
  "Meera Joshi",
  "Rohan Deshpande",
];

function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

function dateWithOffset(days: number, hour = 10, minute = 15): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function addMinutes(value: string, minutes: number): string {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function addDays(value: string, days: number): string {
  return new Date(new Date(value).getTime() + days * 86_400_000).toISOString();
}

function securityFor(index: number): SecuritySettings {
  return {
    ...DEFAULT_SECURITY,
    disableBackNavigation: index % 4 === 3,
  };
}

function questionSnapshots(questions: Question[], ids: string[]) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return ids.flatMap((questionId) => {
    const question = byId.get(questionId);
    if (!question) return [];
    return [
      {
        questionId: question.id,
        questionText: question.questionText,
        options: [...question.options],
        correctOption: question.correctOption,
        explanation: question.explanation,
        topic: question.topic,
        difficulty: question.difficulty,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
      },
    ];
  });
}

function orderFor(
  assessment: Assessment,
  questions: Question[],
  random: () => number,
): AttemptQuestionSlot[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const questionIds = assessment.security.randomizeQuestions
    ? deterministicShuffle(assessment.questionIds, random)
    : [...assessment.questionIds];
  return questionIds.flatMap((questionId) => {
    const question = byId.get(questionId);
    if (!question) return [];
    const originalOptions = question.options.map((_, index) => index);
    return [
      {
        questionId,
        optionOrder: assessment.security.randomizeOptions
          ? deterministicShuffle(originalOptions, random)
          : originalOptions,
      },
    ];
  });
}

function pick<T>(items: readonly T[], random: () => number): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random() * items.length)];
}

function eventSeverity(eventType: IntegrityEventType): Severity {
  if (eventType === "FULLSCREEN_EXIT" || eventType === "CAMERA_STREAM_INTERRUPTED") return "High";
  if (eventType === "MULTIPLE_FULLSCREEN_EXITS" || eventType === "WINDOW_BLUR") return "Medium";
  if (eventType === "TAB_SWITCH" || eventType === "CAMERA_DISABLED") return "Medium";
  return "Low";
}

function addSeedEvent(
  events: ServerIntegrityEvent[],
  attemptId: string,
  eventType: IntegrityEventType,
  timestamp: string,
  clientEventId: string,
  durationSec?: number,
): void {
  events.push({
    id: `evt_${secureToken(18)}`,
    attemptId,
    eventType,
    timestamp,
    severity: eventSeverity(eventType),
    ...(durationSec === undefined ? {} : { durationSec }),
    clientEventId,
    receivedAt: timestamp,
  });
}

function integrityStatus(eventCount: number, assessment: Assessment): IntegrityStatus {
  if (eventCount >= assessment.security.flagAfterEvents) return "Flagged";
  if (eventCount > 0) return "Review Required";
  return "Clean";
}

type AssessmentSpec = {
  title: string;
  program: string;
  module: string;
  status: AssessmentStatus;
  requestedQuestions: number;
  duration: number;
  difficulty: Difficulty;
  schedule: "live" | "scheduled" | "completed" | "archived";
};

const ASSESSMENT_SPECS: AssessmentSpec[] = [
  {
    title: "Product Thinking Fundamentals",
    program: "Product Management",
    module: "Product Thinking & Customer Obsession",
    status: "Live",
    requestedQuestions: 20,
    duration: 20,
    difficulty: "Easy",
    schedule: "live",
  },
  {
    title: "Market Research & Competitive Intelligence",
    program: "Product Management",
    module: "Market Research & Competitive Intelligence",
    status: "Live",
    requestedQuestions: 20,
    duration: 25,
    difficulty: "Medium",
    schedule: "live",
  },
  {
    title: "User Research & Product Discovery",
    program: "Product Management",
    module: "User Research & Product Discovery",
    status: "Live",
    requestedQuestions: 20,
    duration: 25,
    difficulty: "Medium",
    schedule: "live",
  },
  {
    title: "Product Strategy & Vision",
    program: "Product Management",
    module: "Product Strategy & Vision Development",
    status: "Completed",
    requestedQuestions: 20,
    duration: 30,
    difficulty: "Mixed",
    schedule: "completed",
  },
  {
    title: "PRD & Roadmap Management",
    program: "Product Management",
    module: "Product Requirements & Roadmap Management",
    status: "Scheduled",
    requestedQuestions: 20,
    duration: 25,
    difficulty: "Medium",
    schedule: "scheduled",
  },
  {
    title: "Product Analytics & Decision Science",
    program: "Product Management",
    module: "Product Analytics & Decision Science",
    status: "Completed",
    requestedQuestions: 24,
    duration: 30,
    difficulty: "Hard",
    schedule: "completed",
  },
  {
    title: "AI for Product Managers",
    program: "Product Management",
    module: "AI for Product Managers",
    status: "Draft",
    requestedQuestions: 16,
    duration: 20,
    difficulty: "Medium",
    schedule: "live",
  },
  {
    title: "Growth & GTM Strategy",
    program: "Product Management",
    module: "Product Growth & GTM Strategy",
    status: "Live",
    requestedQuestions: 20,
    duration: 25,
    difficulty: "Mixed",
    schedule: "live",
  },
  {
    title: "Business Metrics Diagnostic",
    program: "Business Analytics",
    module: "Business Metrics & KPIs",
    status: "Live",
    requestedQuestions: 12,
    duration: 15,
    difficulty: "Medium",
    schedule: "live",
  },
  {
    title: "SQL & Analysis Readiness",
    program: "Data Analytics",
    module: "SQL for Analytics",
    status: "Archived",
    requestedQuestions: 12,
    duration: 15,
    difficulty: "Medium",
    schedule: "archived",
  },
];

function scheduleFor(schedule: AssessmentSpec["schedule"]): { startsAt: string; endsAt: string } {
  if (schedule === "scheduled") {
    return { startsAt: dateWithOffset(7, 9), endsAt: dateWithOffset(21, 18) };
  }
  if (schedule === "completed") {
    return { startsAt: dateWithOffset(-40, 9), endsAt: dateWithOffset(-2, 18) };
  }
  if (schedule === "archived") {
    return { startsAt: dateWithOffset(-90, 9), endsAt: dateWithOffset(-30, 18) };
  }
  return { startsAt: dateWithOffset(-30, 9), endsAt: dateWithOffset(30, 18) };
}

export async function buildSeedDatabase(): Promise<ServerDatabase> {
  const random = seededRandom(20260925);
  const programs = [
    { id: "prog_pm", name: "Product Management", modules: [...PM_MODULES] },
    { id: "prog_ba", name: "Business Analytics", modules: [...BA_MODULES] },
    { id: "prog_da", name: "Data Analytics", modules: [...DA_MODULES] },
  ];
  const [adminPasswordHash, studentPasswordHash] = await Promise.all([
    hashPassword("Admin@123"),
    hashPassword("Student@123"),
  ]);
  const users: ServerUser[] = [
    {
      id: "user_admin",
      name: "Neha Kapoor",
      email: "admin@careerveda.in",
      role: "ADMIN",
      createdAt: dateWithOffset(-180),
      passwordHash: adminPasswordHash,
    },
    {
      id: "stu_demo",
      name: "Demo Student",
      email: "student@careerveda.in",
      role: "STUDENT",
      program: "Product Management",
      createdAt: dateWithOffset(-90),
      passwordHash: studentPasswordHash,
    },
    ...STUDENT_NAMES.map((name, index) => {
      const parts = name.split(" ");
      const first = parts[0]?.toLowerCase() ?? "student";
      const last = parts[1]?.toLowerCase() ?? String(index + 1);
      const program =
        index % 5 === 4
          ? "Data Analytics"
          : index % 3 === 2
            ? "Business Analytics"
            : "Product Management";
      return {
        id: `stu_${index + 1}`,
        name,
        email: `${first}.${last}@careerveda.in`,
        role: "STUDENT" as const,
        program,
        createdAt: dateWithOffset(-80 - index * 3),
        passwordHash: studentPasswordHash,
      };
    }),
  ];

  const questions: Question[] = RAW_QUESTIONS.map((raw, index) => {
    const attempts = 40 + Math.floor(random() * 180);
    const correctPct = Math.round(
      raw.difficulty === "Easy"
        ? 68 + random() * 24
        : raw.difficulty === "Medium"
          ? 46 + random() * 30
          : 26 + random() * 30,
    );
    return {
      id: `q_${(index + 1).toString().padStart(3, "0")}`,
      program: raw.program,
      module: raw.module,
      topic: raw.topic,
      questionText: raw.q,
      options: [...raw.opts],
      correctOption: raw.correct,
      explanation: raw.why,
      difficulty: raw.difficulty,
      marks: 1,
      negativeMarks: 0,
      tags: raw.tags ? [...raw.tags] : [raw.topic.toLowerCase()],
      status: "Active",
      createdBy: "Neha Kapoor",
      createdAt: dateWithOffset(-120 + (index % 90)),
      usage: 1 + Math.floor(random() * 5),
      stats: {
        attempts,
        correctPct,
        skippedPct: Math.floor(random() * 9),
        avgTimeSec: 35 + Math.floor(random() * 70),
      },
    };
  });

  const questionsFor = (program: string, module: string, count: number): string[] => {
    const matching = questions.filter(
      (question) => question.program === program && question.module === module,
    );
    const programQuestions = questions.filter((question) => question.program === program);
    const source = matching.length >= 1 ? matching : programQuestions;
    const selected = deterministicShuffle(source, random).slice(0, Math.min(count, source.length));
    return selected.length > 0 ? selected.map((question) => question.id) : [questions[0]!.id];
  };

  const assessments: Assessment[] = ASSESSMENT_SPECS.map((spec, index) => {
    const schedule = scheduleFor(spec.schedule);
    const questionIds = questionsFor(spec.program, spec.module, spec.requestedQuestions);
    return {
      id: `asmt_${(index + 1).toString().padStart(2, "0")}`,
      title: spec.title,
      description: `${spec.module} scenario-based assessment for the CareerVeda ${spec.program} programme.`,
      program: spec.program,
      module: spec.module,
      difficulty: spec.difficulty,
      duration: spec.duration,
      questionCount: questionIds.length,
      passingPercentage: 60,
      maxAttempts: 1,
      status: spec.status,
      navigationMode: index % 4 === 3 ? "sequential" : "free",
      security: securityFor(index),
      questionIds,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      eligiblePrograms: [spec.program],
      createdAt: dateWithOffset(-60 + index * 3),
      updatedAt: dateWithOffset(-10 + (index % 9)),
    };
  });

  const attempts: AttemptRecord[] = [];
  const events: ServerIntegrityEvent[] = [];
  const usedPairs = new Set<string>();
  const pmStudents = users.filter(
    (user) => user.role === "STUDENT" && user.program === "Product Management",
  );
  const completedCandidates = assessments.filter(
    (assessment) =>
      assessment.program === "Product Management" &&
      (assessment.status === "Live" || assessment.status === "Completed"),
  );
  const completedAssessments = completedCandidates.slice(0, 4);
  const liveAssessments = assessments.filter(
    (assessment) => assessment.program === "Product Management" && assessment.status === "Live",
  );

  for (let index = 0; index < 20; index += 1) {
    const student = pmStudents[index % pmStudents.length];
    const assessment =
      completedAssessments[Math.floor(index / pmStudents.length) % completedAssessments.length];
    if (!student || !assessment) continue;
    const pair = `${student.id}:${assessment.id}`;
    if (usedPairs.has(pair)) continue;
    usedPairs.add(pair);
    const startedAt = dateWithOffset(-20 + (index % 14), 9 + (index % 7), 5 + (index % 40));
    const order = orderFor(assessment, questions, random);
    const answers: AttemptAnswer[] = order.map((slot) => {
      const question = questions.find((candidate) => candidate.id === slot.questionId);
      if (!question)
        return { questionId: slot.questionId, selectedOption: null, answeredAt: startedAt };
      const correct = random() < (question.difficulty === "Easy" ? 0.72 : 0.54);
      const wrongOptions = question.options
        .map((_, optionIndex) => optionIndex)
        .filter((optionIndex) => optionIndex !== question.correctOption);
      const selectedOption =
        random() < 0.04
          ? null
          : correct
            ? question.correctOption
            : (pick(wrongOptions, random) ?? null);
      return { questionId: slot.questionId, selectedOption, answeredAt: startedAt, flagged: false };
    });
    const totalMarks = order.reduce((sum, slot) => {
      const question = questions.find((candidate) => candidate.id === slot.questionId);
      return sum + (question?.marks ?? 1);
    }, 0);
    const score = answers.reduce((sum, answer) => {
      const question = questions.find((candidate) => candidate.id === answer.questionId);
      if (!question || answer.selectedOption === null) return sum;
      return (
        sum +
        (answer.selectedOption === question.correctOption
          ? question.marks
          : -question.negativeMarks)
      );
    }, 0);
    const safeScore = Math.max(0, score);
    const percentage = Math.round((safeScore / Math.max(totalMarks, 1)) * 100);
    const eventCount = index % 5 === 0 ? 4 : index % 3 === 0 ? 2 : 0;
    const attemptId = `att_c${(index + 1).toString().padStart(2, "0")}`;
    const eventTypes: IntegrityEventType[] = [
      "WINDOW_BLUR",
      "TAB_SWITCH",
      "FULLSCREEN_EXIT",
      "CAMERA_STREAM_INTERRUPTED",
      "NETWORK_INTERRUPTION",
    ];
    for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
      const eventType = eventTypes[(index + eventIndex) % eventTypes.length] ?? "TAB_SWITCH";
      addSeedEvent(
        events,
        attemptId,
        eventType,
        addMinutes(startedAt, 2 + eventIndex * 3),
        `seed-${attemptId}-${eventIndex}`,
        eventType === "WINDOW_BLUR" ? 3 + Math.floor(random() * 20) : undefined,
      );
    }
    const status: AttemptStatus = index % 9 === 0 ? "auto_submitted" : "submitted";
    const submittedAt = addMinutes(startedAt, assessment.duration - (index % 6));
    const statusValue = integrityStatus(eventCount, assessment);
    attempts.push({
      id: attemptId,
      assessmentId: assessment.id,
      studentId: student.id,
      startedAt,
      submittedAt,
      status,
      score: safeScore,
      totalMarks,
      percentage,
      passed: percentage >= assessment.passingPercentage,
      timeSpentSec: Math.max(0, (assessment.duration - (index % 6)) * 60),
      questionOrder: order,
      answers,
      integrityStatus: statusValue,
      currentQuestionIndex: Math.max(0, order.length - 1),
      cameraActive: false,
      microphoneActive: false,
      online: true,
      deadlineAt: addMinutes(startedAt, assessment.duration),
      questionSnapshots: questionSnapshots(
        questions,
        order.map((slot) => slot.questionId),
      ),
      lastHeartbeatAt: submittedAt,
      integrityReviewedAt: statusValue === "Clean" ? null : submittedAt,
      integrityReviewNote: statusValue === "Clean" ? null : "Seeded advisory event review",
      integrityReviewedBy: statusValue === "Clean" ? null : "user_admin",
      resultReleasedAt: index % 3 === 0 ? null : submittedAt,
    });
  }

  for (let index = 0; index < 5; index += 1) {
    let selectedStudent: ServerUser | undefined;
    let selectedAssessment: Assessment | undefined;
    for (const student of pmStudents) {
      for (const assessment of liveAssessments) {
        if (!usedPairs.has(`${student.id}:${assessment.id}`)) {
          selectedStudent = student;
          selectedAssessment = assessment;
          break;
        }
      }
      if (selectedStudent && selectedAssessment) break;
    }
    if (!selectedStudent || !selectedAssessment) continue;
    usedPairs.add(`${selectedStudent.id}:${selectedAssessment.id}`);
    const startedAt = new Date(Date.now() - (4 + index * 3) * 60_000).toISOString();
    const order = orderFor(selectedAssessment, questions, random);
    const answerCount = Math.min(order.length - 1, 3 + index * 2);
    const attemptId = `att_l${index + 1}`;
    const eventCount = index === 0 ? 2 : index === 3 ? 3 : 0;
    const eventTypes: IntegrityEventType[] = ["WINDOW_BLUR", "TAB_SWITCH", "FULLSCREEN_EXIT"];
    for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
      const eventType = eventTypes[(index + eventIndex) % eventTypes.length] ?? "TAB_SWITCH";
      addSeedEvent(
        events,
        attemptId,
        eventType,
        addMinutes(startedAt, 2 + eventIndex * 3),
        `seed-${attemptId}-${eventIndex}`,
      );
    }
    const answers: AttemptAnswer[] = order.slice(0, answerCount).map((slot) => {
      const question = questions.find((candidate) => candidate.id === slot.questionId);
      const selectedOption = question ? Math.floor(random() * question.options.length) : null;
      return { questionId: slot.questionId, selectedOption, answeredAt: startedAt, flagged: false };
    });
    const totalMarks = order.reduce((sum, slot) => {
      const question = questions.find((candidate) => candidate.id === slot.questionId);
      return sum + (question?.marks ?? 1);
    }, 0);
    attempts.push({
      id: attemptId,
      assessmentId: selectedAssessment.id,
      studentId: selectedStudent.id,
      startedAt,
      submittedAt: null,
      status: "in_progress",
      score: null,
      totalMarks,
      percentage: null,
      passed: null,
      timeSpentSec: 0,
      questionOrder: order,
      answers,
      integrityStatus: integrityStatus(eventCount, selectedAssessment),
      currentQuestionIndex: answerCount,
      cameraActive: index !== 3,
      microphoneActive: index !== 3,
      online: index !== 4,
      deadlineAt: addMinutes(startedAt, selectedAssessment.duration),
      questionSnapshots: questionSnapshots(
        questions,
        order.map((slot) => slot.questionId),
      ),
      lastHeartbeatAt: startedAt,
      integrityReviewedAt: null,
      integrityReviewNote: null,
      integrityReviewedBy: null,
      resultReleasedAt: null,
    });
  }

  return {
    programs,
    users,
    questions,
    assessments,
    attempts,
    events,
    settings: {
      organisation: "CareerVeda",
      supportEmail: "assessments@careerveda.in",
      resultsAutoRelease: false,
      defaultSecurity: { ...DEFAULT_SECURITY },
    },
  };
}
