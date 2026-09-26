/**
 * Authenticated SSR smoke test for the admin pages whose sections were changed
 * to render on demand. A 200 alone is not enough: a bad field access inside a
 * collapsed section would still throw while rendering, so the HTML is also
 * scanned for framework error output.
 */
import { toJSONAsync } from "file:///C:/Users/VISHAL/OneDrive/Documents/Downloads/Exam-Center/node_modules/seroval/dist/esm/production/index.mjs";

const BASE = "http://localhost:8080";
const EMAIL = "admin@careerveda.in";
const PASSWORD = "Admin@123";

const src = await (await fetch(`${BASE}/src/lib/server/features/auth.server.ts`)).text();
const hit = /createClientRpc\("([^"]+)"\)/.exec(src.slice(src.indexOf("export const login")));
if (!hit) {
  console.log("could not resolve the login server function id");
  process.exit(1);
}

const res = await fetch(`${BASE}/_serverFn/${hit[1]}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-tsr-serverFn": "true",
    origin: BASE,
    referer: `${BASE}/login`,
    accept: "application/json",
  },
  body: JSON.stringify(await toJSONAsync({ data: { email: EMAIL, password: PASSWORD } }, {})),
});
const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!cookie) {
  console.log(`login failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
console.log(`login: HTTP ${res.status}`);

async function check(path) {
  const page = await fetch(`${BASE}${path}`, { headers: { cookie } });
  const html = await page.text();
  const bad = [
    "Application error",
    "Internal Server Error",
    "Something went wrong",
    "Cannot read properties of",
    "is not a function",
  ].filter((needle) => html.includes(needle));
  const sections = (html.match(/aria-label="(?:Expand|Collapse) [^"]+"/g) ?? []).map((m) =>
    m.replace(/aria-label="(Expand|Collapse) /, "").replace(/"$/, ""),
  );
  console.log(
    `${path} -> HTTP ${page.status} ${bad.length ? `ERRORS: ${bad.join(", ")}` : "clean"}`,
  );
  if (sections.length) console.log(`   on-demand sections: ${sections.join(" | ")}`);
  return page.status === 200 && bad.length === 0;
}

let ok = true;
for (const path of ["/admin", "/admin/settings", "/admin/results", "/admin/monitoring"]) {
  ok = (await check(path)) && ok;
}

const listHtml = await (await fetch(`${BASE}/admin/results`, { headers: { cookie } })).text();
const ids = [
  ...new Set([...listHtml.matchAll(/\/admin\/results\/([A-Za-z0-9_-]+)/g)].map((m) => m[1])),
];
for (const id of ids.slice(0, 3)) {
  ok = (await check(`/admin/results/${id}`)) && ok;
}

console.log(`\nattempt detail pages found: ${ids.length}`);
console.log(ok ? "All admin pages rendered clean." : "FAILURES above.");
process.exitCode = ok ? 0 : 1;
