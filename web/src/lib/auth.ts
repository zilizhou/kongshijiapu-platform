import { compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { query } from "./db";
import { Role, SessionUser } from "./types";

const COOKIE = "kj_session";

function secretKey() {
  const secret = process.env.AUTH_SECRET || "dev-secret";
  return new TextEncoder().encode(secret);
}

export async function loginWithPassword(username: string, password: string) {
  const rows = await query<
    (RowDataPacket & {
      id: string;
      username: string;
      password_hash: string;
      display_name: string;
      role: Role;
    })[]
  >(
    `SELECT id, username, password_hash, display_name, role
     FROM app_users WHERE username = :username AND is_active = 1 LIMIT 1`,
    { username },
  );
  const user = rows[0];
  if (!user) return null;
  const ok = await compare(password, user.password_hash);
  if (!ok) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  } satisfies SessionUser;
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function readSessionFromToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.id || !payload.role) return null;
    return {
      id: String(payload.id),
      username: String(payload.username || ""),
      displayName: String(payload.displayName || ""),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return readSessionFromToken(token);
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function requireSession() {
  const user = await getSession();
  if (!user) throw new AuthError("未登录");
  return user;
}

export function requireRole(user: SessionUser, roles: Role[]) {
  if (!roles.includes(user.role) && user.role !== "admin") {
    throw new AuthError("无权限");
  }
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function getTokenFromRequest(req: NextRequest) {
  return req.cookies.get(COOKIE)?.value;
}
