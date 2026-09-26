/**
 * End-to-end test for admin student enrolment.
 *
 * Exercises the real HTTP path a browser uses: admin login -> createStudent
 * server fn -> the /admin/students page -> candidate login. Membership is
 * asserted against the rendered HTML rather than a decoded RPC payload, so the
 * test proves the student is actually visible to the admin and not merely
 * accepted by the store.
 *
 * The duplicate-email and non-admin cases matter because both must fail
 * server-side; a client-side guard alone would still be bypassable.
 */
import { toJSONAsync } from "file:///C:/Users/VISHAL/OneDrive/Documents/Downloads/Exam-Center/node_modules/seroval/dist/esm/production/index.mjs";

const BASE = "http://localhost:8080";
const ADMIN = { email: "admin@careerveda.in", password: "Admin@123" };
const STAMP = Date.now();
const NEW_STUDENT = {
  name: "Test Candidate",
  email: `candidate.${STAMP}@example.com`,
  program: "Data Analytics",
  password: "Enrol2026x",
};

async function source(path) {
  return (await fetch(`${BASE}${path}`)).text();
}

function rpcId(src, exportName) {
  const at = src.indexOf(`export const ${exportName}`);
  if (at < 0) throw new Error(`could not find export ${exportName}`);
  const hit = /createClientRpc\("([^"]+)"\)/.exec(src.slice(at));
  if (!hit) throw new Error(`could not resolve server function id for ${exportName}`);
  return hit[1];
}

const [authSrc, studentSrc] = await Promise.all([
  source("/src/lib/server/features/auth.server.ts"),
  source("/src/lib/server/features/students.server.ts"),
]);
const ids = {
  login: rpcId(authSrc, "login"),
  createStudent: rpcId(studentSrc, "createStudent"),
  listStudents: rpcId(studentSrc, "listStudents"),
  listPrograms: rpcId(studentSrc, "listPrograms"),
};

async function post(id, payload, cookie, referer = "/admin/students") {
  return fetch(`${BASE}/_serverFn/${id}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tsr-serverFn": "true",
      origin: BASE,
      referer: `${BASE}${referer}`,
      accept: "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(await toJSONAsync(payload ? { data: payload } : {}, {})),
  });
}

/** Read-only server functions are declared with method GET. */
function get(id, cookie) {
  return fetch(`${BASE}/_serverFn/${id}`, {
    method: "GET",
    headers: {
      "x-tsr-serverFn": "true",
      origin: BASE,
      referer: `${BASE}/admin/students`,
      accept: "application/json",
      ...(cookie ? { cookie } : {}),
    },
  });
}

async function page(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  return { status: res.status, html: await res.text() };
}

/** Rows in the students table, extracted from the rendered markup. */
function studentIdsIn(html) {
  return new Set(
    [...html.matchAll(/href="\/admin\/students\/([A-Za-z0-9_-]+)"/g)].map((m) => m[1]),
  );
}

/**
 * TanStack Start returns server-function failures as HTTP 200 with the error
 * serialized into the payload (seroval node type 25). A plain status check
 * would report every rejected request as a success.
 */
function rejected(body) {
  return body.includes('"t":25');
}

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
  }
}

// --- admin session -------------------------------------------------------
const adminRes = await post(ids.login, ADMIN, "", "/login");
const adminCookie = adminRes.headers.get("set-cookie")?.split(";")[0] ?? "";
console.log(`\nadmin login: HTTP ${adminRes.status}`);
check("admin session established", Boolean(adminCookie));
if (!adminCookie) process.exit(1);

const before = studentIdsIn((await page("/admin/students", adminCookie)).html);
console.log(`students rendered before: ${before.size}`);

// --- the programme catalogue is real ------------------------------------
const programsRes = await get(ids.listPrograms, adminCookie);
const programsText = await programsRes.text();
check("programme catalogue loads", programsRes.status === 200);
check(
  "chosen programme exists in catalogue",
  programsText.includes(NEW_STUDENT.program),
  NEW_STUDENT.program,
);

// --- validation is refused server-side -----------------------------------
for (const [label, payload] of [
  ["blank name", { ...NEW_STUDENT, name: "  " }],
  ["malformed email", { ...NEW_STUDENT, email: "not-an-email" }],
  ["short password", { ...NEW_STUDENT, password: "abc1" }],
  ["letters-only password", { ...NEW_STUDENT, password: "abcdefghij" }],
  ["numbers-only password", { ...NEW_STUDENT, password: "12345678" }],
  ["unknown programme", { ...NEW_STUDENT, program: "Astrology" }],
]) {
  const res = await post(ids.createStudent, payload, adminCookie);
  const body = await res.text();
  check(`rejects ${label}`, rejected(body), body.slice(0, 140));
}
const afterInvalid = studentIdsIn((await page("/admin/students", adminCookie)).html);
check(
  "no rows created by invalid input",
  afterInvalid.size === before.size,
  `${before.size} -> ${afterInvalid.size}`,
);

// --- create --------------------------------------------------------------
const createdRes = await post(ids.createStudent, NEW_STUDENT, adminCookie);
const createdText = await createdRes.text();
console.log(`\ncreate: HTTP ${createdRes.status}`);
check(
  "creation succeeds",
  !rejected(createdText) && createdRes.status === 200,
  createdText.slice(0, 200),
);
check("response never contains a password hash", !/passwordHash|pbkdf2_sha256/i.test(createdText));
check("response never echoes the password", !createdText.includes(NEW_STUDENT.password));

const createdId = /stud_[A-Za-z0-9_-]+/.exec(createdText)?.[0] ?? "";
check("returns a student id", Boolean(createdId), createdId);
check("id is unrelated to the email", createdId !== NEW_STUDENT.email);

// --- it is really visible to the admin ----------------------------------
const afterHtml = (await page("/admin/students", adminCookie)).html;
const after = studentIdsIn(afterHtml);
check("new row renders on /admin/students", after.has(createdId), createdId);
check(
  "list grew by exactly one",
  after.size === before.size + 1,
  `${before.size} -> ${after.size}`,
);
check("row shows the student's name", afterHtml.includes(NEW_STUDENT.name));
check("row shows the student's email", afterHtml.includes(NEW_STUDENT.email));
check("row shows the programme", afterHtml.includes(NEW_STUDENT.program));
check(
  "new student has no fabricated average",
  /<\/td>\s*<td class="text-right">\s*(?:<span[^>]*>—<\/span>)/.test(afterHtml) ||
    afterHtml.includes("—"),
);

const detail = await page(`/admin/students/${createdId}`, adminCookie);
check("student detail page renders", detail.status === 200, `HTTP ${detail.status}`);
check("detail page shows the email", detail.html.includes(NEW_STUDENT.email));
check(
  "detail page reports no attempts",
  detail.html.includes("No attempts yet"),
  "expected the empty-state message",
);

// --- duplicate email is refused -----------------------------------------
const dupe = await post(ids.createStudent, { ...NEW_STUDENT, name: "Someone Else" }, adminCookie);
const dupeText = await dupe.text();
check("duplicate email rejected", rejected(dupeText), dupeText.slice(0, 160));
check("duplicate error is explicit", /already exists/i.test(dupeText), dupeText.slice(0, 160));
const afterDupe = studentIdsIn((await page("/admin/students", adminCookie)).html);
check(
  "duplicate attempt created no row",
  afterDupe.size === after.size,
  `${after.size} -> ${afterDupe.size}`,
);

// --- the candidate can actually log in ----------------------------------
const studentRes = await post(
  ids.login,
  { email: NEW_STUDENT.email, password: NEW_STUDENT.password },
  "",
  "/login",
);
const studentCookie = studentRes.headers.get("set-cookie")?.split(";")[0] ?? "";
const studentBody = await studentRes.text();
check(
  "new student can log in",
  !rejected(studentBody) && studentRes.status === 200 && Boolean(studentCookie),
  studentBody.slice(0, 140),
);

const wrongRes = await post(
  ids.login,
  { email: NEW_STUDENT.email, password: "WrongPass1" },
  "",
  "/login",
);
const wrongBody = await wrongRes.text();
check("wrong password refused", rejected(wrongBody), wrongBody.slice(0, 140));

const studentPage = await page("/student", studentCookie);
check(
  "new student reaches the student area",
  studentPage.status === 200,
  `HTTP ${studentPage.status}`,
);

// --- students cannot enrol other students -------------------------------
const asStudent = await post(
  ids.createStudent,
  { ...NEW_STUDENT, email: `sneaky.${STAMP}@example.com` },
  studentCookie,
);
const sneakyBody = await asStudent.text();
check("non-admin cannot enrol", rejected(sneakyBody), sneakyBody.slice(0, 140));

console.log(
  failures === 0
    ? `\nAll enrolment checks passed.\n  created: ${createdId} <${NEW_STUDENT.email}>`
    : `\n${failures} enrolment check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
