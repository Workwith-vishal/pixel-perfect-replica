/**
 * Drives the exam runner's own evidence path over HTTP with real sessions:
 * proctoringStatus -> startAttempt -> uploadProctoringArtifact -> admin read-back,
 * then checks what happens to an upload once the attempt is submitted.
 *
 * The browser-only half of proctoring (getUserMedia, canvas, MediaRecorder) cannot
 * be driven from here, but every server-side gate the runner depends on can.
 */
import { toJSONAsync } from "file:///C:/Users/VISHAL/OneDrive/Documents/Downloads/Exam-Center/node_modules/seroval/dist/esm/production/index.mjs";

const BASE = "http://localhost:8080";
const STUDENT = { email: "student@careerveda.in", password: "Student@123" };
const ADMIN = { email: "admin@careerveda.in", password: "Admin@123" };
/** Smallest valid JPEG: a 1x1 red pixel, base64 without the data: prefix. */
const JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const src = async (path) => (await fetch(`${BASE}${path}`)).text();
const rid = (text, name) => {
  const at = text.indexOf(`export const ${name}`);
  if (at < 0) throw new Error(`missing export ${name}`);
  const match = /createClientRpc\("([^"]+)"\)/.exec(text.slice(at));
  if (!match) throw new Error(`no rpc id for ${name}`);
  return match[1];
};

const [attemptSrc, procSrc, authSrc, studentSrc] = await Promise.all([
  src("/src/lib/server/features/attempts.server.ts"),
  src("/src/lib/server/features/proctoring.server.ts"),
  src("/src/lib/server/features/auth.server.ts"),
  src("/src/lib/server/features/students.server.ts"),
]);

const ids = {
  login: rid(authSrc, "login"),
  startAttempt: rid(attemptSrc, "startAttempt"),
  submitAttempt: rid(attemptSrc, "submitAttempt"),
  proctoringStatus: rid(procSrc, "proctoringStatus"),
  upload: rid(procSrc, "uploadProctoringArtifact"),
  list: rid(procSrc, "listAttemptProctoringArtifacts"),
  reset: rid(authSrc, "resetDemoData"),
  createStudent: rid(studentSrc, "createStudent"),
};

const headers = (cookie, referer) => ({
  "x-tsr-serverFn": "true",
  origin: BASE,
  referer: `${BASE}${referer}`,
  accept: "application/json",
  ...(cookie ? { cookie } : {}),
});

async function post(id, data, cookie, referer = "/student") {
  return fetch(`${BASE}/_serverFn/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers(cookie, referer) },
    body: JSON.stringify(await toJSONAsync(data === undefined ? {} : { data }, {})),
  });
}

async function get(id, cookie, data, referer = "/student") {
  const query = data
    ? `?payload=${encodeURIComponent(JSON.stringify(await toJSONAsync({ data }, {})))}`
    : "";
  return fetch(`${BASE}/_serverFn/${id}${query}`, {
    method: "GET",
    headers: headers(cookie, referer),
  });
}

/** TanStack Start serializes server-fn failures into a 200 response. */
const rejected = (text) => text.includes('"t":25');

/**
 * seroval encodes a boolean as node type 2 where s=2 is true and s=3 is false.
 * (Verified against toJSONAsync: true -> {"t":2,"s":2}, false -> {"t":2,"s":3}.)
 */
function readBoolean(text, key) {
  const at = text.indexOf(`"${key}"`);
  if (at < 0) return null;
  const tail = text.slice(at);
  const node = /"t":2,"s":(\d)/.exec(tail);
  if (!node) return null;
  return node[1] === "2";
}

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` -> ${detail}`}`);
};
const show = (text, n = 240) => console.log(`        ${text.slice(0, n).replace(/\s+/g, " ")}`);

async function session(creds) {
  const res = await post(ids.login, creds, "", "/login");
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/*
 * The reset has to happen before the real logins: resetDemoData calls
 * clearSessionStore(), which invalidates every session including the one that
 * triggered it, so any cookie obtained earlier is dead afterwards.
 */
const bootstrapCookie = await session(ADMIN);
const resetBody = await (await post(ids.reset, undefined, bootstrapCookie, "/admin")).text();
console.log(`\n0. resetDemoData -> ${rejected(resetBody) ? "ERROR" : "ok"}`);
if (rejected(resetBody)) {
  show(resetBody, 200);
  process.exit(1);
}

const adminCookie = await session(ADMIN);
check("admin session established", Boolean(adminCookie));
if (!adminCookie) process.exit(1);

/* -- a fresh candidate, so attempt limits are not in the way -------------- */
console.log("\n0b. createStudent (fresh candidate with no prior attempts)");
const stamp = Date.now();
const fresh = {
  name: "Evidence Tester",
  email: `evidence.${stamp}@example.com`,
  // asmt_01 is the seeded Live/open paper, and it is restricted to Product
  // Management (eligiblePrograms). The only Data Analytics paper is Archived,
  // so a DA student cannot start anything.
  program: "Product Management",
  password: "Enrol2026x",
};
const createdBody = await (
  await post(ids.createStudent, fresh, adminCookie, "/admin/students")
).text();
check("fresh student created", !rejected(createdBody), createdBody.slice(0, 200));

const studentCookie = await session({ email: fresh.email, password: fresh.password });
check("fresh student signed in", Boolean(studentCookie));
if (!studentCookie) process.exit(1);

/* -- 1. does the exam UI even believe storage is on? ------------------- */
console.log("\n1. proctoringStatus (the gate on every upload)");
const statusBody = await (await get(ids.proctoringStatus, studentCookie)).text();
check("proctoringStatus is not an error", !rejected(statusBody), statusBody.slice(0, 140));
show(statusBody);
check(
  "storage reports configured=true",
  readBoolean(statusBody, "configured") === true,
  "uploads are skipped when false",
);

/* -- 2. a real attempt ------------------------------------------------- */
console.log("\n2. startAttempt");
const startedBody = await (
  await post(ids.startAttempt, { assessmentId: "asmt_01" }, studentCookie)
).text();
if (rejected(startedBody)) {
  show(startedBody, 320);
  check("startAttempt succeeded", false, "cannot continue without an attempt");
  process.exit(1);
}
const attemptId = /att_[A-Za-z0-9_-]+/.exec(startedBody)?.[0] ?? "";
check("obtained a live attempt", Boolean(attemptId), attemptId);
if (!attemptId) process.exit(1);

/* -- 3. upload a snapshot the way the runner does ---------------------- */
console.log("\n3. uploadProctoringArtifact (snapshot)");
const payload = (kind) => ({
  attemptId,
  assessmentId: "asmt_01",
  kind,
  reason: kind === "clip" ? "TAB_SWITCH" : "interval",
  mimeType: kind === "clip" ? "video/webm" : "image/jpeg",
  capturedAt: new Date().toISOString(),
  faceCount: 1,
  attentionScore: 0.82,
  metadata: { byteSize: 631 },
  data: JPEG,
});

const upBody = await (
  await post(ids.upload, payload("snapshot"), studentCookie, `/student/exam/${attemptId}`)
).text();
check("snapshot upload is not rejected", !rejected(upBody), upBody.slice(0, 300));
show(upBody);
check("snapshot reports stored", /stored/.test(upBody), upBody.slice(0, 200));

const clipBody = await (
  await post(ids.upload, payload("clip"), studentCookie, `/student/exam/${attemptId}`)
).text();
check("clip upload is not rejected", !rejected(clipBody), clipBody.slice(0, 300));
check("clip reports stored or a reason", /stored/.test(clipBody), clipBody.slice(0, 200));
show(clipBody);

/* -- 4. admin read-back ------------------------------------------------ */
console.log("\n4. admin read-back");
const listBody = await (await get(ids.list, adminCookie, { attemptId }, "/admin")).text();
check("admin list is not an error", !rejected(listBody), listBody.slice(0, 200));
show(listBody, 300);
check("artifacts are listed", /snapshot|clip/i.test(listBody), "expected the stored artifacts");
check("signed urls are present", /signedUrl|token/i.test(listBody), "no signed url in payload");

/* -- 5. what happens after submit -------------------------------------- */
console.log("\n5. after submitAttempt");
const subBody = await (
  await post(ids.submitAttempt, { attemptId }, studentCookie, `/student/exam/${attemptId}`)
).text();
check("submitAttempt is not an error", !rejected(subBody), subBody.slice(0, 200));

const afterBody = await (
  await post(ids.upload, payload("snapshot"), studentCookie, `/student/exam/${attemptId}`)
).text();
check("post-submit upload is refused", rejected(afterBody), afterBody.slice(0, 200));
show(afterBody);

console.log(failures === 0 ? "\nEvidence path verified." : `\n${failures} check(s) failed.`);
process.exit(failures ? 1 : 0);
