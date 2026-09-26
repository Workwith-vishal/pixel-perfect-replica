// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Vite only injects VITE_* vars into `import.meta.env` and never touches `process.env`, but the
// Supabase proctoring store reads server secrets with `process.env` (via @supabase/server's
// resolveEnv). Copy SUPABASE_* out of .env into process.env for the dev/SSR process. Real
// environment variables always win, and nothing here is exposed to the browser bundle.
const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    const key = match?.[1];
    const rawValue = match?.[2];
    if (!key || rawValue === undefined) continue;
    if (!key.startsWith("SUPABASE_")) continue;
    const value = rawValue.replace(/^["']|["']$/g, "").trim();
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this.
    server: { entry: "server" },
    importProtection: {
      // Everything else under src/lib/server (database, seed, crypto, csv, proctoring-store) stays
      // blocked from the client. Only these feature modules are pure `createServerFn` RPC
      // endpoints, which the Start compiler rewrites into client proxies, so they must be
      // importable from the browser.
      client: {
        excludeFiles: ["src/lib/server/features/**"],
      },
    },
  },
});
