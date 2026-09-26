import "@tanstack/react-start/server-only";

import { getCookie, deleteCookie, setCookie } from "@tanstack/react-start/server";
import type { User } from "../data/types";
import { secureToken } from "./crypto.server";
import { assertCondition } from "./errors";
import type { ServerDatabase, ServerUser } from "./models.server";
import { findUserById, getDatabase, publicUser } from "./repository";

const sessionCookie = "careerveda_session";
const sessionTtlMs = 8 * 60 * 60 * 1000;
type SessionRecord = { userId: string; expiresAt: number };
const sessions = new Map<string, SessionRecord>();

export const SESSION_COOKIE = sessionCookie;

export function createSession(userId: string): string {
  const previousToken = getCookie(sessionCookie);
  if (previousToken) sessions.delete(previousToken);
  const token = secureToken(32);
  sessions.set(token, { userId, expiresAt: Date.now() + sessionTtlMs });
  setCookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: Math.floor(sessionTtlMs / 1000),
  });
  return token;
}

export function destroySession(): void {
  const token = getCookie(sessionCookie);
  if (token) sessions.delete(token);
  deleteCookie(sessionCookie, { path: "/" });
}

export function clearSessionStore(): void {
  sessions.clear();
}

export async function currentUser(): Promise<ServerUser | undefined> {
  const token = getCookie(sessionCookie);
  if (!token) return undefined;
  const record = sessions.get(token);
  if (!record || record.expiresAt <= Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  const database = await getDatabase();
  return findUserById(database, record.userId);
}

export async function requireUser(): Promise<{ database: ServerDatabase; user: ServerUser }> {
  const database = await getDatabase();
  const user = await currentUser();
  assertCondition(user, "UNAUTHENTICATED", "Sign in is required", 401);
  return { database, user };
}

export async function requireAdmin(): Promise<{ database: ServerDatabase; user: ServerUser }> {
  const result = await requireUser();
  assertCondition(
    result.user.role === "ADMIN",
    "FORBIDDEN",
    "Administrator access is required",
    403,
  );
  return result;
}

export async function requireStudent(): Promise<{ database: ServerDatabase; user: ServerUser }> {
  const result = await requireUser();
  assertCondition(result.user.role === "STUDENT", "FORBIDDEN", "Student access is required", 403);
  return result;
}

export function viewer(user: ServerUser): User {
  return publicUser(user);
}
