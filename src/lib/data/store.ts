/**
 * Mock backend for the CareerVeda Assessment Center prototype.
 *
 * This module stands in for a real API server. It is deliberately the ONLY
 * place that knows about correct answers, grading and attempt timing, so it can
 * later be replaced by real HTTP/server-function calls without touching the UI:
 *
 *   - `getStudentPaper()` returns sanitised questions (no correctOption, no
 *     explanation). The test screen never receives an answer key.
 *   - `submitAttempt()` performs the grading. The student UI never computes a
 *     score, and no score is returned to the student surface.
 *
 * Persistence is localStorage so a prototype session survives reloads.
 */
import { RAW_QUESTIONS } from "./questions.seed";
import type {
  Assessment,
  AssessmentStatus,
  Attempt,
  AttemptQuestionSlot,
  Difficulty,
  IntegrityEvent,
  IntegrityEventType,
  IntegrityStatus,
  NavigationMode,
  PlatformSettings,
  Program,
  Question,
  SecuritySettings,
  Severity,
  StudentQuestion,
  User,
} from "./types";

const STORAGE_KEY = "careerveda_assessment_db_v1";
const LATENCY = 180;

export interface DB {
  programs: Program[];
  users: User[];
  questions: Question[];
  assessments: Assessment[];
  attempts: Attempt[];
  events: IntegrityEvent[];
  settings: PlatformSettings;
}

/* ------------------------------------------------------------------ helpers */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function daysAgo(n: number, hour = 10, minute = 15) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const DEFAULT_SECURITY: SecuritySettings = {
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
};

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
  "Sneha Reddy",
];

/* --------------------------------------------------------------- seed build */

function buildSeed(): DB {
  const rnd = mulberry32(20260925);

  const programs: Program[] = [
    { id: "prog_pm", name: "Product Management", modules: PM_MODULES },
    { id: "prog_ba", name: "Business Analytics", modules: BA_MODULES },
    { id: "prog_da", name: "Data Analytics", modules: DA_MODULES },
  ];

  const users: User[] = [
    {
      id: "user_admin",
      name: "Neha Kapoor",
      email: "admin@careerveda.in",
      role: "ADMIN",
      createdAt: daysAgo(180),
    },
    {
      id: "stu_demo",
      name: "Demo Student",
      email: "student@careerveda.in",
      role: "STUDENT",
      program: "Product Management",
      createdAt: daysAgo(90),
    },
    ...STUDENT_NAMES.map((name, i) => ({
      id: `stu_${i + 1}`,
      name,
      email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@careerveda.in`,
      role: "STUDENT" as const,
      program:
        i % 5 === 4 ? "Data Analytics" : i % 3 === 2 ? "Business Analytics" : "Product Management",
      createdAt: daysAgo(80 - i * 3),
    })),
  ];

  const questions: Question[] = RAW_QUESTIONS.map((raw, i) => {
    const attempts = 40 + Math.floor(rnd() * 180);
    const correctPct = Math.round(
      raw.difficulty === "Easy"
        ? 68 + rnd() * 24
        : raw.difficulty === "Medium"
          ? 46 + rnd() * 30
          : 26 + rnd() * 30,
    );
    return {
      id: `q_${(i + 1).toString().padStart(3, "0")}`,
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
      tags: raw.tags ?? [raw.topic.toLowerCase()],
      status: "Active",
      createdBy: "Neha Kapoor",
      createdAt: daysAgo(120 - (i % 90)),
      usage: 1 + Math.floor(rnd() * 5),
      stats: {
        attempts,
        correctPct,
        skippedPct: Math.round(rnd() * 9),
        avgTimeSec: 35 + Math.floor(rnd() * 70),
      },
    };
  });

  const questionsFor = (program: string, modules: string[], count: number) => {
    const pool = questions.filter(
      (q) => q.program === program && (modules.length === 0 || modules.includes(q.module)),
    );
    const fallback = questions.filter((q) => q.program === program);
    const source = pool.length >= 4 ? pool : fallback;
    return shuffled(source, rnd)
      .slice(0, Math.min(count, source.length))
      .map((q) => q.id);
  };

  type Spec = [string, string, string, AssessmentStatus, number, number, Difficulty];
  const specs: Spec[] = [
    [
      "Product Thinking Fundamentals",
      "Product Management",
      "Product Thinking & Customer Obsession",
      "Live",
      20,
      20,
      "Easy",
    ],
    [
      "Market Research & Competitive Intelligence",
      "Product Management",
      "Market Research & Competitive Intelligence",
      "Live",
      20,
      25,
      "Medium",
    ],
    [
      "User Research & Product Discovery",
      "Product Management",
      "User Research & Product Discovery",
      "Live",
      20,
      25,
      "Medium",
    ],
    [
      "Product Strategy & Vision",
      "Product Management",
      "Product Strategy & Vision Development",
      "Completed",
      20,
      30,
      "Mixed",
    ],
    [
      "PRD & Roadmap Management",
      "Product Management",
      "Product Requirements & Roadmap Management",
      "Scheduled",
      20,
      25,
      "Medium",
    ],
    [
      "Product Analytics & Decision Science",
      "Product Management",
      "Product Analytics & Decision Science",
      "Completed",
      24,
      30,
      "Hard",
    ],
    [
      "AI for Product Managers",
      "Product Management",
      "AI for Product Managers",
      "Draft",
      16,
      20,
      "Medium",
    ],
    [
      "Growth & GTM Strategy",
      "Product Management",
      "Product Growth & GTM Strategy",
      "Live",
      20,
      25,
      "Mixed",
    ],
    ["Business Metrics Diagnostic", "Business Analytics", "Business Metrics & KPIs", "Live", 12, 15, "Medium"],
    ["SQL & Analysis Readiness", "Data Analytics", "SQL for Analytics", "Archived", 12, 15, "Medium"],
  ];

  const assessments: Assessment[] = specs.map((s, i) => {
    const [title, program, module, status, questionCount, duration, difficulty] = s;
    const ids = questionsFor(program, [module], questionCount);
    return {
      id: `asmt_${(i + 1).toString().padStart(2, "0")}`,
      title,
      description: `${module} — scenario-based MCQ assessment for the CareerVeda ${program} programme.`,
      program,
      module,
      difficulty,
      duration,
      questionCount: ids.length,
      passingPercentage: 60,
      maxAttempts: 1,
      status,
      navigationMode: i % 4 === 3 ? "sequential" : "free",
      security: { ...DEFAULT_SECURITY, disableBackNavigation: i % 4 === 3 },
      questionIds: ids,
      createdAt: daysAgo(60 - i * 4),
      updatedAt: daysAgo(10 - (i % 9)),
    };
  });

  const students = users.filter((u) => u.role === "STUDENT");
  const attempts: Attempt[] = [];
  const events: IntegrityEvent[] = [];

  const makeOrder = (a: Assessment): AttemptQuestionSlot[] => {
    const ids = a.security.randomizeQuestions ? shuffled(a.questionIds, rnd) : a.questionIds;
    return ids.map((questionId) => {
      const q = questions.find((x) => x.id === questionId)!;
      const base = q.options.map((_, idx) => idx);
      return { questionId, optionOrder: a.security.randomizeOptions ? shuffled(base, rnd) : base };
    });
  };

  const addEvents = (attemptId: string, count: number, startedAt: string) => {
    const types: [IntegrityEventType, Severity][] = [
      ["WINDOW_BLUR", "Medium"],
      ["TAB_SWITCH", "Medium"],
      ["FULLSCREEN_EXIT", "High"],
      ["CAMERA_STREAM_INTERRUPTED", "High"],
      ["NETWORK_INTERRUPTION", "Low"],
    ];
    for (let i = 0; i < count; i++) {
      const [eventType, severity] = types[Math.floor(rnd() * types.length)];
      const ts = new Date(new Date(startedAt).getTime() + (2 + i * 3) * 60000).toISOString();
      events.push({
        id: uid("evt"),
        attemptId,
        eventType,
        timestamp: ts,
        durationSec: eventType === "WINDOW_BLUR" ? 3 + Math.floor(rnd() * 20) : undefined,
        severity,
      });
    }
  };

  // 20 completed attempts
  const completedPool = assessments.filter((a) => a.status !== "Draft" && a.questionIds.length > 0);
  for (let i = 0; i < 20; i++) {
    const a = completedPool[i % completedPool.length];
    const student = students[(i + 1) % students.length];
    const startedAt = daysAgo(1 + (i % 14), 9 + (i % 7), 5 + (i % 40));
    const order = makeOrder(a);
    const answers = order.map((slot) => {
      const q = questions.find((x) => x.id === slot.questionId)!;
      const correct = rnd() < 0.52 + (q.difficulty === "Easy" ? 0.2 : 0);
      const wrongOptions = q.options.map((_, idx) => idx).filter((idx) => idx !== q.correctOption);
      return {
        questionId: slot.questionId,
        selectedOption:
          rnd() < 0.04
            ? null
            : correct
              ? q.correctOption
              : wrongOptions[Math.floor(rnd() * wrongOptions.length)],
        answeredAt: startedAt,
      };
    });
    const totalMarks = order.reduce(
      (sum, s) => sum + (questions.find((q) => q.id === s.questionId)?.marks ?? 1),
      0,
    );
    const score = answers.reduce((sum, ans) => {
      const q = questions.find((x) => x.id === ans.questionId)!;
      return sum + (ans.selectedOption === q.correctOption ? q.marks : 0);
    }, 0);
    const percentage = Math.round((score / totalMarks) * 100);
    const eventCount = i % 5 === 0 ? 4 : i % 3 === 0 ? 2 : 0;
    const id = `att_c${(i + 1).toString().padStart(2, "0")}`;
    addEvents(id, eventCount, startedAt);
    attempts.push({
      id,
      assessmentId: a.id,
      studentId: student.id,
      startedAt,
      submittedAt: new Date(
        new Date(startedAt).getTime() + (a.duration - (i % 6)) * 60000,
      ).toISOString(),
      status: i % 9 === 0 ? "auto_submitted" : "submitted",
      score,
      totalMarks,
      percentage,
      passed: percentage >= a.passingPercentage,
      timeSpentSec: (a.duration - (i % 6)) * 60,
      questionOrder: order,
      answers,
      integrityStatus:
        eventCount >= a.security.flagAfterEvents
          ? "Flagged"
          : eventCount > 0
            ? "Review Required"
            : "Clean",
      currentQuestionIndex: order.length - 1,
      cameraActive: false,
      online: true,
    });
  }

  // 5 active attempts (live monitoring)
  const livePool = assessments.filter((a) => a.status === "Live" && a.questionIds.length > 0);
  for (let i = 0; i < 5; i++) {
    const a = livePool[i % livePool.length];
    const student = students[(i + 3) % students.length];
    const minutesIn = 4 + i * 3;
    const startedAt = new Date(Date.now() - minutesIn * 60000).toISOString();
    const order = makeOrder(a);
    const answered = Math.min(order.length - 1, 3 + i * 2);
    const id = `att_l${i + 1}`;
    const eventCount = i === 0 ? 2 : i === 3 ? 3 : 0;
    addEvents(id, eventCount, startedAt);
    attempts.push({
      id,
      assessmentId: a.id,
      studentId: student.id,
      startedAt,
      submittedAt: null,
      status: "in_progress",
      score: null,
      totalMarks: order.length,
      percentage: null,
      passed: null,
      timeSpentSec: minutesIn * 60,
      questionOrder: order,
      answers: order.slice(0, answered).map((slot) => ({
        questionId: slot.questionId,
        selectedOption: Math.floor(rnd() * 4),
        answeredAt: startedAt,
      })),
      integrityStatus:
        eventCount >= a.security.flagAfterEvents
          ? "Flagged"
          : eventCount > 0
            ? "Review Required"
            : "Clean",
      currentQuestionIndex: answered,
      cameraActive: i !== 3,
      online: i !== 4,
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
      defaultSecurity: DEFAULT_SECURITY,
    },
  };
}

/* ----------------------------------------------------------------- database */

let db: DB | null = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getDB(): DB {
  if (db) return db;
  if (isBrowser()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        db = JSON.parse(raw) as DB;
        return db;
      }
    } catch {
      /* fall through to a fresh seed */
    }
  }
  db = buildSeed();
  persist();
  return db;
}

function persist() {
  if (!db || !isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota — prototype tolerates it */
  }
}

export function resetDemoData() {
  db = buildSeed();
  persist();
}

/* ------------------------------------------------------------------- lookups */

export const api = {
  async listPrograms(): Promise<Program[]> {
    return delay(getDB().programs);
  },

  async getSettings(): Promise<PlatformSettings> {
    return delay(getDB().settings);
  },

  async updateSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
    const d = getDB();
    d.settings = { ...d.settings, ...patch };
    persist();
    return delay(d.settings);
  },

  async listStudents(): Promise<
    (User & { attempts: number; completed: number; flagged: number; avgPercentage: number | null })[]
  > {
    const d = getDB();
    const rows = d.users
      .filter((u) => u.role === "STUDENT")
      .map((u) => {
        const mine = d.attempts.filter((a) => a.studentId === u.id);
        const done = mine.filter((a) => a.percentage !== null);
        return {
          ...u,
          attempts: mine.length,
          completed: done.length,
          flagged: mine.filter((a) => a.integrityStatus === "Flagged").length,
          avgPercentage: done.length
            ? Math.round(done.reduce((s, a) => s + (a.percentage ?? 0), 0) / done.length)
            : null,
        };
      });
    return delay(rows);
  },

  /* ------------------------------------------------------------- questions */

  async listQuestions(filter?: {
    program?: string;
    module?: string;
    topic?: string;
    difficulty?: string;
    status?: string;
    search?: string;
  }): Promise<Question[]> {
    const f = filter ?? {};
    const rows = getDB().questions.filter((q) => {
      if (f.program && f.program !== "all" && q.program !== f.program) return false;
      if (f.module && f.module !== "all" && q.module !== f.module) return false;
      if (f.topic && f.topic !== "all" && q.topic !== f.topic) return false;
      if (f.difficulty && f.difficulty !== "all" && q.difficulty !== f.difficulty) return false;
      if (f.status && f.status !== "all" && q.status !== f.status) return false;
      if (f.search && !q.questionText.toLowerCase().includes(f.search.toLowerCase())) return false;
      return true;
    });
    return delay(rows);
  },

  async getQuestion(id: string): Promise<Question | undefined> {
    return delay(getDB().questions.find((q) => q.id === id));
  },

  async createQuestion(
    input: Omit<Question, "id" | "createdAt" | "usage" | "stats" | "status" | "createdBy"> & {
      createdBy?: string;
    },
  ): Promise<Question> {
    const d = getDB();
    const q: Question = {
      ...input,
      id: uid("q"),
      status: "Active",
      createdBy: input.createdBy ?? "Neha Kapoor",
      createdAt: new Date().toISOString(),
      usage: 0,
      stats: { attempts: 0, correctPct: 0, skippedPct: 0, avgTimeSec: 0 },
    };
    d.questions.unshift(q);
    persist();
    return delay(q);
  },

  async updateQuestion(id: string, patch: Partial<Question>): Promise<Question | undefined> {
    const d = getDB();
    const idx = d.questions.findIndex((q) => q.id === id);
    if (idx < 0) return delay(undefined);
    d.questions[idx] = { ...d.questions[idx], ...patch };
    persist();
    return delay(d.questions[idx]);
  },

  async duplicateQuestion(id: string): Promise<Question | undefined> {
    const d = getDB();
    const src = d.questions.find((q) => q.id === id);
    if (!src) return delay(undefined);
    const copy: Question = {
      ...src,
      id: uid("q"),
      questionText: `${src.questionText} (copy)`,
      createdAt: new Date().toISOString(),
      usage: 0,
      stats: { attempts: 0, correctPct: 0, skippedPct: 0, avgTimeSec: 0 },
    };
    d.questions.unshift(copy);
    persist();
    return delay(copy);
  },

  async setQuestionStatus(ids: string[], status: Question["status"]): Promise<void> {
    const d = getDB();
    d.questions = d.questions.map((q) => (ids.includes(q.id) ? { ...q, status } : q));
    persist();
    return delay(undefined);
  },

  async importQuestions(
    rows: {
      program: string;
      module: string;
      topic: string;
      difficulty: Question["difficulty"];
      questionText: string;
      options: string[];
      correctOption: number;
      explanation: string;
      marks: number;
    }[],
  ): Promise<number> {
    const d = getDB();
    rows.forEach((r) => {
      d.questions.unshift({
        ...r,
        id: uid("q"),
        negativeMarks: 0,
        tags: [r.topic.toLowerCase()],
        status: "Active",
        createdBy: "Bulk import",
        createdAt: new Date().toISOString(),
        usage: 0,
        stats: { attempts: 0, correctPct: 0, skippedPct: 0, avgTimeSec: 0 },
      });
    });
    persist();
    return delay(rows.length);
  },

  /* ----------------------------------------------------------- assessments */

  async listAssessments(status?: string): Promise<Assessment[]> {
    const rows = getDB().assessments.filter(
      (a) => !status || status === "all" || a.status === status,
    );
    return delay([...rows].sort((x, y) => y.createdAt.localeCompare(x.createdAt)));
  },

  async getAssessment(id: string): Promise<Assessment | undefined> {
    return delay(getDB().assessments.find((a) => a.id === id));
  },

  async createAssessment(input: {
    title: string;
    description: string;
    program: string;
    module: string;
    difficulty: Difficulty;
    duration: number;
    questionCount: number;
    passingPercentage: number;
    maxAttempts: number;
    navigationMode: NavigationMode;
    security: SecuritySettings;
    questionIds: string[];
    status: AssessmentStatus;
  }): Promise<Assessment> {
    const d = getDB();
    const now = new Date().toISOString();
    const a: Assessment = { ...input, id: uid("asmt"), createdAt: now, updatedAt: now };
    d.assessments.unshift(a);
    persist();
    return delay(a);
  },

  async updateAssessment(id: string, patch: Partial<Assessment>): Promise<Assessment | undefined> {
    const d = getDB();
    const idx = d.assessments.findIndex((a) => a.id === id);
    if (idx < 0) return delay(undefined);
    d.assessments[idx] = { ...d.assessments[idx], ...patch, updatedAt: new Date().toISOString() };
    persist();
    return delay(d.assessments[idx]);
  },

  /* ------------------------------------------------------------- dashboard */

  async adminStats() {
    const d = getDB();
    const submitted = d.attempts.filter((a) => a.percentage !== null);
    return delay({
      totalAssessments: d.assessments.length,
      activeAssessments: d.assessments.filter((a) => a.status === "Live").length,
      attemptingNow: d.attempts.filter((a) => a.status === "in_progress").length,
      completed: submitted.length,
      averageScore: submitted.length
        ? Math.round(submitted.reduce((s, a) => s + (a.percentage ?? 0), 0) / submitted.length)
        : 0,
      flagged: d.attempts.filter((a) => a.integrityStatus !== "Clean").length,
      totalQuestions: d.questions.length,
      students: d.users.filter((u) => u.role === "STUDENT").length,
      passRate: submitted.length
        ? Math.round((submitted.filter((a) => a.passed).length / submitted.length) * 100)
        : 0,
      avgCompletionMin: submitted.length
        ? Math.round(submitted.reduce((s, a) => s + a.timeSpentSec, 0) / submitted.length / 60)
        : 0,
    });
  },

  async analytics() {
    const d = getDB();
    const submitted = d.attempts.filter((a) => a.percentage !== null);
    const buckets = ["0-20", "21-40", "41-60", "61-80", "81-100"];
    const distribution = buckets.map((label) => ({ label, count: 0 }));
    submitted.forEach((a) => {
      const p = a.percentage ?? 0;
      const i = p <= 20 ? 0 : p <= 40 ? 1 : p <= 60 ? 2 : p <= 80 ? 3 : 4;
      distribution[i].count += 1;
    });

    const byAssessment = d.assessments
      .map((a) => {
        const rows = submitted.filter((x) => x.assessmentId === a.id);
        return {
          name: a.title,
          attempts: rows.length,
          avgScore: rows.length
            ? Math.round(rows.reduce((s, x) => s + (x.percentage ?? 0), 0) / rows.length)
            : 0,
          avgTimeMin: rows.length
            ? Math.round(rows.reduce((s, x) => s + x.timeSpentSec, 0) / rows.length / 60)
            : 0,
          completionRate: rows.length
            ? Math.round(
                (rows.filter((x) => x.status !== "expired").length / Math.max(rows.length, 1)) * 100,
              )
            : 0,
        };
      })
      .filter((r) => r.attempts > 0);

    const eventCounts = new Map<string, number>();
    d.events.forEach((e) => eventCounts.set(e.eventType, (eventCounts.get(e.eventType) ?? 0) + 1));

    const questionPerformance = [...d.questions]
      .sort((a, b) => a.stats.correctPct - b.stats.correctPct)
      .map((q) => ({
        id: q.id,
        text: q.questionText,
        module: q.module,
        difficulty: q.difficulty,
        attempts: q.stats.attempts,
        correctPct: q.stats.correctPct,
        skippedPct: q.stats.skippedPct,
        avgTimeSec: q.stats.avgTimeSec,
      }));

    const difficultyMix = (["Easy", "Medium", "Hard"] as const).map((level) => ({
      label: level,
      count: d.questions.filter((q) => q.difficulty === level).length,
      avgCorrect: Math.round(
        d.questions
          .filter((q) => q.difficulty === level)
          .reduce((s, q) => s + q.stats.correctPct, 0) /
          Math.max(d.questions.filter((q) => q.difficulty === level).length, 1),
      ),
    }));

    return delay({
      distribution,
      byAssessment,
      integrityEvents: [...eventCounts.entries()].map(([label, count]) => ({ label, count })),
      questionPerformance,
      difficultyMix,
    });
  },

  /* ---------------------------------------------------------- monitoring */

  async liveAttempts() {
    const d = getDB();
    return delay(
      d.attempts
        .filter((a) => a.status === "in_progress")
        .map((a) => {
          const assessment = d.assessments.find((x) => x.id === a.assessmentId);
          const student = d.users.find((u) => u.id === a.studentId);
          const elapsed = Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 1000);
          const remaining = Math.max(0, (assessment?.duration ?? 0) * 60 - elapsed);
          return {
            attemptId: a.id,
            studentName: student?.name ?? "Unknown",
            studentEmail: student?.email ?? "",
            assessmentTitle: assessment?.title ?? "",
            startedAt: a.startedAt,
            remainingSec: remaining,
            cameraActive: a.cameraActive,
            online: a.online,
            currentQuestion: a.currentQuestionIndex + 1,
            totalQuestions: a.questionOrder.length,
            eventCount: d.events.filter((e) => e.attemptId === a.id).length,
            integrityStatus: a.integrityStatus,
          };
        }),
    );
  },

  async attemptTimeline(attemptId: string) {
    const d = getDB();
    return delay(
      d.events
        .filter((e) => e.attemptId === attemptId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    );
  },

  /* ------------------------------------------------------------- results */

  async listResults() {
    const d = getDB();
    return delay(
      d.attempts
        .filter((a) => a.percentage !== null)
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
        .map((a) => ({
          attemptId: a.id,
          studentName: d.users.find((u) => u.id === a.studentId)?.name ?? "Unknown",
          assessmentTitle: d.assessments.find((x) => x.id === a.assessmentId)?.title ?? "",
          score: a.score ?? 0,
          totalMarks: a.totalMarks,
          percentage: a.percentage ?? 0,
          timeSpentSec: a.timeSpentSec,
          passed: !!a.passed,
          integrityStatus: a.integrityStatus,
          submittedAt: a.submittedAt,
          status: a.status,
        })),
    );
  },

  async getResultDetail(attemptId: string) {
    const d = getDB();
    const attempt = d.attempts.find((a) => a.id === attemptId);
    if (!attempt) return delay(undefined);
    const assessment = d.assessments.find((a) => a.id === attempt.assessmentId);
    const student = d.users.find((u) => u.id === attempt.studentId);
    const rows = attempt.questionOrder.map((slot, i) => {
      const q = d.questions.find((x) => x.id === slot.questionId)!;
      const ans = attempt.answers.find((a) => a.questionId === slot.questionId);
      return {
        index: i + 1,
        questionId: q.id,
        questionText: q.questionText,
        options: q.options,
        correctOption: q.correctOption,
        selectedOption: ans?.selectedOption ?? null,
        isCorrect: ans?.selectedOption === q.correctOption,
        explanation: q.explanation,
        topic: q.topic,
        difficulty: q.difficulty,
        marks: q.marks,
      };
    });
    return delay({
      attempt,
      assessment,
      student,
      rows,
      events: d.events
        .filter((e) => e.attemptId === attemptId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    });
  },

  async releaseResult(attemptId: string, integrityStatus: IntegrityStatus) {
    const d = getDB();
    const a = d.attempts.find((x) => x.id === attemptId);
    if (a) {
      a.integrityStatus = integrityStatus;
      persist();
    }
    return delay(true);
  },

  /* --------------------------------------------------------- student side */

  async studentAssessments(studentId: string) {
    const d = getDB();
    const student = d.users.find((u) => u.id === studentId);
    return delay(
      d.assessments
        .filter(
          (a) =>
            (a.status === "Live" || a.status === "Scheduled") &&
            (!student?.program || a.program === student.program),
        )
        .map((a) => {
          const mine = d.attempts.filter(
            (x) => x.assessmentId === a.id && x.studentId === studentId,
          );
          const active = mine.find((x) => x.status === "in_progress");
          const done = mine.filter((x) => x.status !== "in_progress");
          return {
            id: a.id,
            title: a.title,
            description: a.description,
            program: a.program,
            module: a.module,
            duration: a.duration,
            questionCount: a.questionIds.length,
            maxAttempts: a.maxAttempts,
            status: a.status,
            attemptsUsed: done.length,
            inProgressAttemptId: active?.id ?? null,
            lastSubmittedAt: done[0]?.submittedAt ?? null,
            /** deliberately no score / percentage on the student surface */
          };
        }),
    );
  },

  /** Starts (or resumes) an attempt and returns the sanitised paper. */
  async startAttempt(assessmentId: string, studentId: string) {
    const d = getDB();
    const assessment = d.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return delay({ error: "NOT_FOUND" as const });
    const existing = d.attempts.find(
      (a) =>
        a.assessmentId === assessmentId && a.studentId === studentId && a.status === "in_progress",
    );
    const used = d.attempts.filter(
      (a) => a.assessmentId === assessmentId && a.studentId === studentId && a.status !== "in_progress",
    ).length;
    if (!existing && used >= assessment.maxAttempts) {
      return delay({ error: "ATTEMPT_LIMIT" as const });
    }
    if (existing) return delay({ attemptId: existing.id });

    const rnd = mulberry32(Date.now() % 100000);
    const ids = assessment.security.randomizeQuestions
      ? shuffled(assessment.questionIds, rnd)
      : assessment.questionIds;
    const order: AttemptQuestionSlot[] = ids.map((questionId) => {
      const q = d.questions.find((x) => x.id === questionId)!;
      const base = q.options.map((_, i) => i);
      return {
        questionId,
        optionOrder: assessment.security.randomizeOptions ? shuffled(base, rnd) : base,
      };
    });
    const attempt: Attempt = {
      id: uid("att"),
      assessmentId,
      studentId,
      startedAt: new Date().toISOString(),
      submittedAt: null,
      status: "in_progress",
      score: null,
      totalMarks: order.reduce(
        (s, slot) => s + (d.questions.find((q) => q.id === slot.questionId)?.marks ?? 1),
        0,
      ),
      percentage: null,
      passed: null,
      timeSpentSec: 0,
      questionOrder: order,
      answers: [],
      integrityStatus: "Clean",
      currentQuestionIndex: 0,
      cameraActive: false,
      online: true,
    };
    d.attempts.unshift(attempt);
    persist();
    return delay({ attemptId: attempt.id });
  },

  /**
   * Returns the student-safe paper for an attempt.
   * correctOption and explanation are stripped here and never leave the store.
   */
  async getStudentPaper(attemptId: string, studentId: string) {
    const d = getDB();
    const attempt = d.attempts.find((a) => a.id === attemptId);
    if (!attempt || attempt.studentId !== studentId) return delay({ error: "NOT_FOUND" as const });
    const assessment = d.assessments.find((a) => a.id === attempt.assessmentId)!;
    if (attempt.status !== "in_progress") return delay({ error: "ALREADY_SUBMITTED" as const });

    const elapsed = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
    const remainingSec = Math.max(0, assessment.duration * 60 - elapsed);

    const questions: StudentQuestion[] = attempt.questionOrder.map((slot) => {
      const q = d.questions.find((x) => x.id === slot.questionId)!;
      return {
        id: q.id,
        questionText: q.questionText,
        options: slot.optionOrder.map((origIdx) => q.options[origIdx]),
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        topic: q.topic,
      };
    });

    // saved answers translated back into DISPLAY indexes for the UI
    const savedAnswers: Record<string, number> = {};
    attempt.answers.forEach((ans) => {
      if (ans.selectedOption === null) return;
      const slot = attempt.questionOrder.find((s) => s.questionId === ans.questionId)!;
      const displayIdx = slot.optionOrder.indexOf(ans.selectedOption);
      if (displayIdx >= 0) savedAnswers[ans.questionId] = displayIdx;
    });

    return delay({
      attemptId: attempt.id,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        duration: assessment.duration,
        navigationMode: assessment.navigationMode,
        security: assessment.security,
        passingPercentage: assessment.passingPercentage,
      },
      questions,
      savedAnswers,
      flagged: attempt.answers.filter((a) => a.flagged).map((a) => a.questionId),
      remainingSec,
      startedAt: attempt.startedAt,
    });
  },

  /** Saves one answer. `displayedOption` is the index the student saw. */
  async saveAnswer(attemptId: string, questionId: string, displayedOption: number | null) {
    const d = getDB();
    const attempt = d.attempts.find((a) => a.id === attemptId);
    if (!attempt || attempt.status !== "in_progress") return delay({ ok: false });
    const slot = attempt.questionOrder.find((s) => s.questionId === questionId);
    if (!slot) return delay({ ok: false });
    const original = displayedOption === null ? null : slot.optionOrder[displayedOption];
    const existing = attempt.answers.find((a) => a.questionId === questionId);
    if (existing) {
      existing.selectedOption = original;
      existing.answeredAt = new Date().toISOString();
    } else {
      attempt.answers.push({
        questionId,
        selectedOption: original,
        answeredAt: new Date().toISOString(),
      });
    }
    persist();
    return delay({ ok: true });
  },

  async setFlag(attemptId: string, questionId: string, flagged: boolean) {
    const d = getDB();
    const attempt = d.attempts.find((a) => a.id === attemptId);
    if (!attempt) return delay({ ok: false });
    const existing = attempt.answers.find((a) => a.questionId === questionId);
    if (existing) existing.flagged = flagged;
    else
      attempt.answers.push({
        questionId,
        selectedOption: null,
        answeredAt: new Date().toISOString(),
        flagged,
      });
    persist();
    return delay({ ok: true });
  },

  async updateAttemptProgress(
    attemptId: string,
    patch: { currentQuestionIndex?: number; cameraActive?: boolean; online?: boolean },
  ) {
    const d = getDB();
    const attempt = d.attempts.find((a) => a.id === attemptId);
    if (!attempt) return delay({ ok: false });
    Object.assign(attempt, patch);
    persist();
    return delay({ ok: true });
  },

  async logIntegrityEvent(input: {
    attemptId: string;
    eventType: IntegrityEventType;
    severity: Severity;
    durationSec?: number;
    metadata?: Record<string, string | number>;
  }) {
    const d = getDB();
    const attempt = d.attempts.find((a) => a.id === input.attemptId);
    const event: IntegrityEvent = {
      id: uid("evt"),
      attemptId: input.attemptId,
      eventType: input.eventType,
      timestamp: new Date().toISOString(),
      severity: input.severity,
      durationSec: input.durationSec,
      metadata: input.metadata,
    };
    d.events.push(event);
    if (attempt) {
      const assessment = d.assessments.find((a) => a.id === attempt.assessmentId);
      const count = d.events.filter((e) => e.attemptId === attempt.id).length;
      const flagAfter = assessment?.security.flagAfterEvents ?? 3;
      attempt.integrityStatus = count >= flagAfter ? "Flagged" : count > 0 ? "Review Required" : "Clean";
    }
    persist();
    return delay({ eventCount: d.events.filter((e) => e.attemptId === input.attemptId).length });
  },

  /**
   * Grades and closes the attempt. Grading happens entirely here; the student
   * surface receives only a submission receipt — never a score.
   */
  async submitAttempt(attemptId: string, auto = false) {
    const d = getDB();
    const attempt = d.attempts.find((a) => a.id === attemptId);
    if (!attempt) return delay({ error: "NOT_FOUND" as const });
    if (attempt.status !== "in_progress") {
      return delay({
        submissionId: attempt.id.toUpperCase(),
        submittedAt: attempt.submittedAt!,
        answered: attempt.answers.filter((a) => a.selectedOption !== null).length,
        totalQuestions: attempt.questionOrder.length,
      });
    }
    const assessment = d.assessments.find((a) => a.id === attempt.assessmentId)!;
    let score = 0;
    attempt.answers.forEach((ans) => {
      if (ans.selectedOption === null) return;
      const q = d.questions.find((x) => x.id === ans.questionId);
      if (!q) return;
      if (ans.selectedOption === q.correctOption) score += q.marks;
      else score -= q.negativeMarks;
    });
    score = Math.max(0, score);
    const percentage = Math.round((score / Math.max(attempt.totalMarks, 1)) * 100);
    attempt.status = auto ? "auto_submitted" : "submitted";
    attempt.submittedAt = new Date().toISOString();
    attempt.score = score;
    attempt.percentage = percentage;
    attempt.passed = percentage >= assessment.passingPercentage;
    attempt.timeSpentSec = Math.floor(
      (new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000,
    );
    persist();
    return delay({
      submissionId: attempt.id.toUpperCase(),
      submittedAt: attempt.submittedAt,
      answered: attempt.answers.filter((a) => a.selectedOption !== null).length,
      totalQuestions: attempt.questionOrder.length,
    });
  },

  /** Student-facing receipt. Contains no scoring information by design. */
  async getSubmissionReceipt(attemptId: string, studentId: string) {
    const d = getDB();
    const attempt = d.attempts.find((a) => a.id === attemptId && a.studentId === studentId);
    if (!attempt) return delay(undefined);
    const assessment = d.assessments.find((a) => a.id === attempt.assessmentId);
    return delay({
      submissionId: attempt.id.toUpperCase(),
      submittedAt: attempt.submittedAt,
      answered: attempt.answers.filter((a) => a.selectedOption !== null).length,
      totalQuestions: attempt.questionOrder.length,
      assessmentTitle: assessment?.title ?? "",
      autoSubmitted: attempt.status === "auto_submitted",
    });
  },

  async findUserByEmail(email: string) {
    return delay(
      getDB().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null,
    );
  },
};
