/**
 * Server functions reject with a serialized `Error` (or a `ServerFnError`
 * wrapper). These helpers normalise both shapes into something renderable.
 */

/**
 * A Zod failure arrives as the *stringified* issue list, e.g.
 * `[{"code":"too_small","message":"Enter the student's full name","path":["name"]}]`.
 * Shown raw that is unreadable, so reduce it to the messages the schema wrote
 * for the user, falling back to the field name when a message is absent.
 */
function humanizeIssues(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("[")) return null;
  let issues: unknown;
  try {
    issues = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(issues) || issues.length === 0) return null;

  const labels = issues
    .map((issue) => {
      if (!issue || typeof issue !== "object") return null;
      const record = issue as Record<string, unknown>;
      const text = typeof record["message"] === "string" ? record["message"] : null;
      const path = Array.isArray(record["path"]) ? record["path"].join(".") : "";
      if (text) return text;
      return path ? `Check ${path}` : null;
    })
    .filter((value): value is string => Boolean(value));

  return labels.length ? labels.join(". ") : null;
}

function resolveMessage(candidate: string): string {
  return humanizeIssues(candidate) ?? candidate;
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (!error) return fallback;
  if (typeof error === "string") return resolveMessage(error);
  if (error instanceof Error && error.message) return resolveMessage(error.message);
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error", "cause", "data"]) {
      const value = record[key];
      if (typeof value === "string" && value) return resolveMessage(value);
      if (value && typeof value === "object") {
        const nested = (value as Record<string, unknown>)["message"];
        if (typeof nested === "string" && nested) return resolveMessage(nested);
      }
    }
    try {
      const parsed: unknown = JSON.parse(JSON.stringify(error));
      if (parsed && typeof parsed === "object") {
        const nested = (parsed as Record<string, unknown>)["message"];
        if (typeof nested === "string" && nested) return resolveMessage(nested);
      }
    } catch {
      /* fall through to the default message */
    }
  }
  return fallback;
}
