/**
 * Round-trip check for proctoring evidence storage, using exactly the same
 * credentials and endpoints the server uses (secret key -> PostgREST + Storage).
 * Creates one throwaway artifact, proves signed-URL retrieval, then removes it.
 */
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const BUCKET = "proctoring-media";
const path = `verify/connectivity-check-${Date.now()}.jpg`;

// Smallest valid JPEG, so this exercises the real mime allowlist.
const jpegBase64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const bytes = Buffer.from(jpegBase64, "base64");

console.log("1. read table via PostgREST");
const read = await fetch(`${url}/rest/v1/proctoring_artifacts?select=id&limit=1`, { headers });
console.log(`   HTTP ${read.status} ${read.status === 200 ? "OK" : await read.text()}`);

// PostgREST answers 201 with an empty body unless representation is requested.
const insertHeaders = { ...headers, Prefer: "return=representation" };

console.log("2. upload object to private bucket");
const upload = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "image/jpeg", "x-upsert": "false" },
  body: bytes,
});
console.log(`   HTTP ${upload.status} ${upload.status === 200 ? "OK" : await upload.text()}`);
if (upload.status !== 200) process.exit(1);

console.log("3. insert artifact row");
const insert = await fetch(`${url}/rest/v1/proctoring_artifacts`, {
  method: "POST",
  headers: insertHeaders,
  body: JSON.stringify({
    attempt_id: "verify-connectivity",
    student_id: "verify-student",
    assessment_id: null,
    kind: "snapshot",
    reason: "interval",
    storage_path: path,
    mime_type: "image/jpeg",
    byte_size: bytes.byteLength,
    captured_at: new Date().toISOString(),
    face_count: 1,
    attention_score: 0.9,
    metadata: { source: "connectivity-check" },
  }),
});
const insertBody = await insert.text();
console.log(`   HTTP ${insert.status} ${insertBody.slice(0, 160)}`);
const row = JSON.parse(insertBody || "[]")[0];
if (!row) {
  console.error("   no row returned; cannot continue");
  process.exit(1);
}

console.log("4. create signed URL (what the admin panel uses)");
const signed = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${path}`, {
  method: "POST",
  headers,
  body: JSON.stringify({ expiresIn: 600 }),
});
const signedBody = await signed.json();
// The raw Storage REST endpoint returns a project-relative path; the
// supabase-js client returns an absolute URL. Handle both.
const raw = signedBody?.signedURL ?? signedBody?.signedUrl;
const signedUrl = raw?.startsWith("http") ? raw : `${url}/storage/v1${raw}`;
console.log(
  `   HTTP ${signed.status} signed=${Boolean(signedUrl)} absolute=${signedUrl.startsWith("http")}`,
);

if (signedUrl) {
  const fetched = await fetch(signedUrl);
  const got = Buffer.from(await fetched.arrayBuffer());
  console.log(
    `   fetch signed URL -> HTTP ${fetched.status}, ${got.byteLength} bytes, match=${got.equals(bytes)}`,
  );
}

console.log("5. anon access must be refused (private bucket)");
const anon = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${path}`);
console.log(`   HTTP ${anon.status} ${anon.status >= 400 ? "correctly refused" : "LEAKED"}`);

console.log("6. record an audit row");
const audit = await fetch(`${url}/rest/v1/proctoring_evidence_access`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    attempt_id: "verify-connectivity",
    admin_id: "verify-admin",
    action: "view",
    artifact_id: row.id,
  }),
});
console.log(`   HTTP ${audit.status}`);

console.log("7. clean up");
await fetch(`${url}/rest/v1/proctoring_evidence_access?attempt_id=eq.verify-connectivity`, {
  method: "DELETE",
  headers,
});
const del = await fetch(`${url}/rest/v1/proctoring_artifacts?attempt_id=eq.verify-connectivity`, {
  method: "DELETE",
  headers,
});
console.log(`   deleted ${del.headers.get("content-range") ?? "?"} row(s)`);
// The storage-js client percent-encodes the whole path, so the raw endpoint
// needs that too or the delete 400s.
await fetch(`${url}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
  method: "DELETE",
  headers,
});
const after = await fetch(`${url}/rest/v1/proctoring_artifacts?select=id`, { headers });
console.log(`   remaining rows: ${(await after.json()).length}`);
console.log("\nAll checks passed.");
