import { randomUUID } from "crypto";
import { hash } from "bcryptjs";
import { RowDataPacket } from "mysql2/promise";
import { formatDateTime } from "./datetime";
import { execute, query } from "./db";
import type { AppUserRow, Role } from "./types";

export type { AppUserRow };

type UserDb = RowDataPacket & {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  is_active: number;
  created_at: Date | string;
};

function mapUser(r: UserDb): AppUserRow {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    isActive: Number(r.is_active) === 1,
    createdAt: formatDateTime(r.created_at) || "",
  };
}

const MANAGEABLE_ROLES: Role[] = [
  "editor",
  "first",
  "second",
  "final",
  "admin",
];

export function isManageableRole(role: string): role is Role {
  return MANAGEABLE_ROLES.includes(role as Role);
}

export async function listUsers(opts?: {
  role?: Role | "";
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts?.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 20));
  const offset = (page - 1) * pageSize;
  const where: string[] = ["1=1"];
  const params: Record<string, unknown> = {};

  if (opts?.role && isManageableRole(opts.role)) {
    where.push("role = :role");
    params.role = opts.role;
  }
  if (opts?.q?.trim()) {
    where.push("(username LIKE :q OR display_name LIKE :q)");
    params.q = `%${opts.q.trim()}%`;
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM app_users WHERE ${whereSql}`,
    params,
  );
  const rows = await query<UserDb[]>(
    `SELECT id, username, display_name, role, is_active, created_at
     FROM app_users
     WHERE ${whereSql}
     ORDER BY FIELD(role,'admin','final','second','first','editor'), username
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  return {
    total: Number(countRows[0]?.c || 0),
    page,
    pageSize,
    items: rows.map(mapUser),
  };
}

export async function getUserById(id: string) {
  const rows = await query<UserDb[]>(
    `SELECT id, username, display_name, role, is_active, created_at
     FROM app_users WHERE id = :id LIMIT 1`,
    { id },
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function createUser(opts: {
  username: string;
  displayName: string;
  role: Role;
  password: string;
}) {
  const username = opts.username.trim();
  const displayName = opts.displayName.trim();
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(username)) {
    throw new Error("用户名需为 2～32 位字母、数字或下划线");
  }
  if (!displayName) throw new Error("请填写显示名称");
  if (!isManageableRole(opts.role)) throw new Error("无效角色");
  if (!opts.password || opts.password.length < 8) {
    throw new Error("密码至少 8 位");
  }

  const exists = await query<RowDataPacket[]>(
    `SELECT id FROM app_users WHERE username = :username LIMIT 1`,
    { username },
  );
  if (exists[0]) throw new Error("用户名已存在");

  const id = randomUUID();
  const passwordHash = await hash(opts.password, 10);
  await execute(
    `INSERT INTO app_users (id, username, password_hash, display_name, role, is_active)
     VALUES (:id, :username, :passwordHash, :displayName, :role, 1)`,
    {
      id,
      username,
      passwordHash,
      displayName,
      role: opts.role,
    },
  );
  return getUserById(id);
}

export async function updateUser(
  id: string,
  opts: {
    displayName?: string;
    role?: Role;
    isActive?: boolean;
    password?: string;
  },
  actorId: string,
) {
  const existing = await getUserById(id);
  if (!existing) throw new Error("用户不存在");

  const displayName =
    opts.displayName != null ? opts.displayName.trim() : existing.displayName;
  if (!displayName) throw new Error("请填写显示名称");

  const role = opts.role ?? existing.role;
  if (!isManageableRole(role)) throw new Error("无效角色");

  const isActive = opts.isActive ?? existing.isActive;

  // 禁止停用/降级最后一个启用中的管理员
  if (
    existing.role === "admin" &&
    existing.isActive &&
    (!isActive || role !== "admin")
  ) {
    const admins = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM app_users
       WHERE role = 'admin' AND is_active = 1 AND id <> :id`,
      { id },
    );
    if (Number(admins[0]?.c || 0) === 0) {
      throw new Error("至少保留一名启用中的管理员");
    }
  }

  // 不能停用自己（避免锁死）
  if (id === actorId && !isActive) {
    throw new Error("不能停用当前登录账号");
  }

  if (opts.password != null && opts.password !== "") {
    if (opts.password.length < 8) throw new Error("密码至少 8 位");
    const passwordHash = await hash(opts.password, 10);
    await execute(
      `UPDATE app_users SET
        display_name = :displayName,
        role = :role,
        is_active = :isActive,
        password_hash = :passwordHash
       WHERE id = :id`,
      {
        id,
        displayName,
        role,
        isActive: isActive ? 1 : 0,
        passwordHash,
      },
    );
  } else {
    await execute(
      `UPDATE app_users SET
        display_name = :displayName,
        role = :role,
        is_active = :isActive
       WHERE id = :id`,
      {
        id,
        displayName,
        role,
        isActive: isActive ? 1 : 0,
      },
    );
  }

  return getUserById(id);
}

export async function deleteUser(id: string, actorId: string) {
  const existing = await getUserById(id);
  if (!existing) throw new Error("用户不存在");
  if (id === actorId) throw new Error("不能删除当前登录账号");

  if (existing.role === "admin") {
    const admins = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM app_users
       WHERE role = 'admin' AND is_active = 1 AND id <> :id`,
      { id },
    );
    if (Number(admins[0]?.c || 0) === 0) {
      throw new Error("至少保留一名启用中的管理员");
    }
  }

  await execute(`DELETE FROM app_users WHERE id = :id`, { id });
  return { ok: true as const };
}
