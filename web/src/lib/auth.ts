import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { query, execute } from "./db";
import { Role, SessionUser } from "./types";

const COOKIE = "kj_session";
/** 自助改密最低长度（默认密码 123456 较弱，鼓励加长） */
export const MIN_PASSWORD_LENGTH = 8;

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

/**
 * 当前登录用户修改自己的密码（须校验原密码）。
 * 管理员重置他人密码请走 users.updateUser。
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (!currentPassword) {
    throw new PasswordError("请输入当前密码");
  }
  if (!newPassword) {
    throw new PasswordError("请输入新密码");
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordError(`新密码至少 ${MIN_PASSWORD_LENGTH} 位`);
  }
  if (newPassword === currentPassword) {
    throw new PasswordError("新密码不能与当前密码相同");
  }

  const rows = await query<
    (RowDataPacket & { password_hash: string; is_active: number })[]
  >(
    `SELECT password_hash, is_active FROM app_users WHERE id = :id LIMIT 1`,
    { id: userId },
  );
  const row = rows[0];
  if (!row || !row.is_active) {
    throw new AuthError("账号不可用");
  }
  const ok = await compare(currentPassword, row.password_hash);
  if (!ok) {
    throw new PasswordError("当前密码不正确");
  }

  const passwordHash = await hash(newPassword, 10);
  await execute(
    `UPDATE app_users SET password_hash = :passwordHash WHERE id = :id`,
    { id: userId, passwordHash },
  );
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

/** 改密校验失败等（客户端可展示 message） */
export class PasswordError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "PasswordError";
  }
}

export function getTokenFromRequest(req: NextRequest) {
  return req.cookies.get(COOKIE)?.value;
}
