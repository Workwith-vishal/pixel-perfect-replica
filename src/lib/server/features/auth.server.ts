import { createServerFn } from "@tanstack/react-start";
import {
  clearSessionStore,
  createSession,
  currentUser,
  destroySession,
  requireAdmin,
  viewer,
} from "../auth";
import { verifyPassword } from "../crypto.server";
import { loginInputSchema } from "../contracts";
import { assertCondition } from "../errors";
import { findUserByEmail, getDatabase, resetDatabase } from "../repository";
import { toViewerDto } from "../serializers.server";

export const login = createServerFn({ method: "POST" })
  .validator(loginInputSchema)
  .handler(async ({ data }) => {
    const database = await getDatabase();
    const user = findUserByEmail(database, data.email);
    assertCondition(user, "INVALID_CREDENTIALS", "Email or password is incorrect", 401);
    const valid = await verifyPassword(data.password, user.passwordHash);
    assertCondition(valid, "INVALID_CREDENTIALS", "Email or password is incorrect", 401);
    createSession(user.id);
    return { viewer: toViewerDto(user) };
  });

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser();
  return user ? toViewerDto(user) : null;
});

export const getCurrentUser = getSession;

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  destroySession();
  return { ok: true as const };
});

export const resetDemoData = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const database = await resetDatabase();
  clearSessionStore();
  return {
    ok: true as const,
    counts: {
      programs: database.programs.length,
      users: database.users.length,
      questions: database.questions.length,
      assessments: database.assessments.length,
      attempts: database.attempts.length,
      events: database.events.length,
    },
  };
});

export const authMe = getSession;
