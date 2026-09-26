import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createAdminClient, resolveEnv } from "@supabase/server/core";

import type {
  ProctoringArtifactDto,
  ProctoringArtifactKind,
  ProctoringStorageFailureDto,
} from "./dto";

/**
 * Proctoring evidence storage.
 *
 * Snapshots and violation clips are written to a private Supabase Storage bucket and described
 * by rows in `public.proctoring_artifacts`. All access goes through the service-role client,
 * which bypasses RLS — the browser never talks to Supabase directly and never sees a key.
 *
 * Everything in here is optional infrastructure: when the environment variables are missing or
 * the migration has not been run yet, the helpers report a typed failure and the exam keeps
 * running with integrity events only.
 */

const BUCKET = "proctoring-media";
const TABLE = "proctoring_artifacts";
const ACCESS_TABLE = "proctoring_evidence_access";
const SIGNED_URL_TTL_SEC = 60 * 10;

type ProctoringRow = {
  id: string;
  attempt_id: string;
  student_id: string;
  assessment_id: string | null;
  kind: ProctoringArtifactKind;
  reason: string | null;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  captured_at: string;
  face_count: number | null;
  attention_score: number | null;
  metadata: Record<string, unknown>;
};

type ProctoringInsert = {
  attempt_id: string;
  student_id: string;
  assessment_id: string | null;
  kind: ProctoringArtifactKind;
  reason: string | null;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  captured_at: string;
  face_count: number | null;
  attention_score: number | null;
  metadata: Record<string, unknown>;
};

/**
 * Minimal shape of the migration so PostgREST results are typed instead of `never`.
 * Must satisfy postgrest-js `GenericSchema`, hence the explicit empty Views/Functions.
 */
type ProctoringDatabase = {
  public: {
    Tables: {
      proctoring_artifacts: {
        Row: ProctoringRow;
        Insert: ProctoringInsert;
        Update: Partial<ProctoringInsert>;
        Relationships: [];
      };
      proctoring_evidence_access: {
        Row: { id: string; attempt_id: string; admin_id: string; artifact_id: string | null };
        Insert: {
          attempt_id: string;
          admin_id: string;
          action: "view" | "play" | "download";
          artifact_id: string | null;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};

type AdminClient = ReturnType<typeof createAdminClient<ProctoringDatabase>>;

type CachedClient =
  | { status: "ready"; client: AdminClient }
  | { status: "error"; failure: ProctoringStorageFailureDto };

/** The subset of `resolveEnv` overrides this store needs. */
type EnvOverrides = { url: string; secretKeys?: Record<string, string> };

let cached: CachedClient | null = null;

function failure(
  code: ProctoringStorageFailureDto["code"],
  message: string,
  hint?: string,
): ProctoringStorageFailureDto {
  return { code, message, ...(hint ? { hint } : {}) };
}

/** Reset the memoised client. Used by tests and after a credential change. */
export function resetProctoringClient(): void {
  cached = null;
  envOverridesCache = undefined;
}

/**
 * Resolves the Supabase settings this process should use.
 *
 * `process.env` is authoritative, but it is not guaranteed to be populated: a
 * long-running dev server started before the credentials were added keeps the
 * environment it launched with, and vite.config.ts only injects them when the
 * config is (re-)evaluated. Reading the env file as a fallback means evidence
 * storage works on the very first start instead of silently reporting
 * "not configured" until someone restarts the server.
 */
function readEnvFile(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    let contents: string;
    try {
      contents = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split("\n")) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      const key = match?.[1];
      const raw = match?.[2];
      if (!key || raw === undefined || key in values) continue;
      values[key] = raw.replace(/^["']|["']$/g, "").trim();
    }
  }
  return values;
}

let envOverridesCache: EnvOverrides | null | undefined;

function envOverrides(): EnvOverrides | null {
  if (envOverridesCache !== undefined) return envOverridesCache;
  const file = readEnvFile();
  const pick = (name: string) => process.env[name] ?? file[name] ?? undefined;
  const url = pick("SUPABASE_URL");
  const secret = pick("SUPABASE_SECRET_KEY") ?? pick("SUPABASE_SERVICE_ROLE_KEY");
  envOverridesCache = url ? { url, ...(secret ? { secretKeys: { default: secret } } : {}) } : null;
  return envOverridesCache;
}

function supabaseEnv(): ReturnType<typeof resolveEnv> {
  const overrides = envOverrides();
  return overrides ? resolveEnv(overrides) : resolveEnv();
}

export function proctoringConfigured(): boolean {
  const { data, error } = supabaseEnv();
  return !error && Boolean(data?.url);
}

async function getClient(): Promise<CachedClient> {
  if (cached) return cached;

  const { data, error } = supabaseEnv();
  if (error || !data) {
    cached = {
      status: "error",
      failure: failure(
        "not_configured",
        "Supabase is not configured for proctoring storage.",
        "Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).",
      ),
    };
    return cached;
  }

  try {
    const overrides = envOverrides();
    cached = {
      status: "ready",
      client: createAdminClient<ProctoringDatabase>(overrides ? { env: overrides } : {}),
    };
  } catch (cause) {
    cached = {
      status: "error",
      failure: failure(
        "not_configured",
        cause instanceof Error ? cause.message : "Could not create the Supabase admin client.",
      ),
    };
  }
  return cached;
}

function extensionFor(mimeType: string, kind: ProctoringArtifactKind): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  return kind === "clip" ? "webm" : "jpg";
}

function storagePath(input: {
  attemptId: string;
  kind: ProctoringArtifactKind;
  capturedAt: string;
  mimeType: string;
}): string {
  const safeAttempt = input.attemptId.replace(/[^A-Za-z0-9_-]/g, "_");
  const stamp = input.capturedAt.replace(/[:.]/g, "-");
  return `${safeAttempt}/${stamp}-${input.kind}.${extensionFor(input.mimeType, input.kind)}`;
}

/** Storage and PostgREST errors look identical to callers; this keeps that in one place. */
function classifyPostgrestError(
  message: string,
  operation: "upload" | "read" = "upload",
): ProctoringStorageFailureDto {
  const text = message.toLowerCase();
  const fallback: ProctoringStorageFailureDto =
    operation === "upload" ? failure("upload_failed", message) : failure("read_failed", message);

  // Credentials are checked first: a misconfigured key must never be reported as
  // a missing migration, or the operator will run SQL that cannot help.
  if (
    text.includes("apikey") ||
    text.includes("api key") ||
    text.includes("jwt") ||
    text.includes("secret api key") ||
    text.includes("authorization") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("row-level security") ||
    text.includes("permission denied")
  ) {
    return failure(
      "not_configured",
      "Supabase rejected the server credentials for proctoring storage.",
      "Check SUPABASE_URL and the server-side secret key in .env. The key is used only on the server and is never sent to the browser.",
    );
  }

  // A missing relation is the one case that is genuinely fixed by running SQL.
  if (
    text.includes("pgrst205") ||
    text.includes("42p01") ||
    text.includes("could not find the table") ||
    text.includes("schema cache") ||
    text.includes("does not exist")
  ) {
    return failure(
      "missing_table",
      "Supabase is reachable but the proctoring tables have not been created yet.",
      "Run supabase/migrations/20260101000000_proctoring_artifacts.sql followed by 20260101000100_proctoring_evidence_access.sql in the Supabase SQL editor.",
    );
  }

  if (text.includes("bucket not found") || text.includes("bucket_id")) {
    return failure(
      "missing_table",
      "The private proctoring-media storage bucket does not exist yet.",
      "Run supabase/migrations/20260101000000_proctoring_artifacts.sql in the Supabase SQL editor to create the bucket.",
    );
  }

  return fallback;
}

export async function storeProctoringArtifact(input: {
  attemptId: string;
  studentId: string;
  assessmentId: string | null;
  kind: ProctoringArtifactKind;
  reason: string | null;
  mimeType: string;
  bytes: Uint8Array;
  capturedAt: string;
  faceCount: number | null;
  attentionScore: number | null;
  metadata: Record<string, string | number | boolean>;
}): Promise<
  | { ok: true; artifact: ProctoringArtifactDto }
  | { ok: false; failure: ProctoringStorageFailureDto }
> {
  const client = await getClient();
  if (client.status === "error") return { ok: false, failure: client.failure };

  const path = storagePath(input);
  const upload = await client.client.storage
    .from(BUCKET)
    .upload(path, input.bytes, { contentType: input.mimeType, upsert: false });

  if (upload.error) {
    return { ok: false, failure: classifyPostgrestError(upload.error.message) };
  }

  const row = {
    attempt_id: input.attemptId,
    student_id: input.studentId,
    assessment_id: input.assessmentId,
    kind: input.kind,
    reason: input.reason,
    storage_path: path,
    mime_type: input.mimeType,
    byte_size: input.bytes.byteLength,
    captured_at: input.capturedAt,
    face_count: input.faceCount,
    attention_score: input.attentionScore,
    metadata: input.metadata,
  };

  const insert = await client.client.from(TABLE).insert(row).select("id").single();

  if (insert.error) {
    // Do not leave an orphaned object behind if the row insert fails.
    await client.client.storage.from(BUCKET).remove([path]);
    return { ok: false, failure: classifyPostgrestError(insert.error.message) };
  }

  return {
    ok: true,
    artifact: {
      id: insert.data.id as string,
      attemptId: row.attempt_id,
      studentId: row.student_id,
      assessmentId: row.assessment_id,
      kind: row.kind,
      reason: row.reason,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      capturedAt: row.captured_at,
      faceCount: row.face_count,
      attentionScore: row.attention_score,
      url: null,
    },
  };
}

export async function listProctoringArtifacts(
  attemptId: string,
  limit = 60,
  audit?: { adminId: string },
): Promise<
  | { ok: true; artifacts: ProctoringArtifactDto[] }
  | { ok: false; failure: ProctoringStorageFailureDto }
> {
  const client = await getClient();
  if (client.status === "error") return { ok: false, failure: client.failure };

  const query = await client.client
    .from(TABLE)
    .select(
      "id, attempt_id, student_id, assessment_id, kind, reason, mime_type, byte_size, captured_at, face_count, attention_score, storage_path",
    )
    .eq("attempt_id", attemptId)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (query.error) {
    return { ok: false, failure: classifyPostgrestError(query.error.message, "read") };
  }

  const artifacts: ProctoringArtifactDto[] = [];
  for (const row of query.data ?? []) {
    const storagePathValue = row.storage_path as string;
    const signed = await client.client.storage
      .from(BUCKET)
      .createSignedUrl(storagePathValue, SIGNED_URL_TTL_SEC);
    artifacts.push({
      id: row.id as string,
      attemptId: row.attempt_id as string,
      studentId: row.student_id as string,
      assessmentId: (row.assessment_id as string | null) ?? null,
      kind: row.kind as ProctoringArtifactKind,
      reason: (row.reason as string | null) ?? null,
      mimeType: row.mime_type as string,
      byteSize: (row.byte_size as number) ?? 0,
      capturedAt: row.captured_at as string,
      faceCount: (row.face_count as number | null) ?? null,
      attentionScore: (row.attention_score as number | null) ?? null,
      url: signed.error ? null : signed.data.signedUrl,
    });
  }

  // Evidence is biometric-adjacent, so an administrator opening it leaves a
  // record. Auditing must never block the review itself.
  if (audit && artifacts.length > 0) {
    await recordEvidenceAccess(
      attemptId,
      audit.adminId,
      artifacts.map((item) => item.id),
    );
  }

  return { ok: true, artifacts };
}

async function recordEvidenceAccess(
  attemptId: string,
  adminId: string,
  artifactIds: string[],
): Promise<void> {
  const client = await getClient();
  if (client.status === "error") return;
  const rows = artifactIds.map((artifactId) => ({
    attempt_id: attemptId,
    admin_id: adminId,
    action: "view" as const,
    artifact_id: artifactId,
  }));
  try {
    await client.client.from(ACCESS_TABLE).insert(rows);
  } catch (error) {
    console.warn("Could not record evidence access", error);
  }
}
