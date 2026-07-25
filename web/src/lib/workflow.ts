import { RowDataPacket } from "mysql2/promise";
import {
  branchToPayload,
  createBranch,
  deleteBranch,
  getBranchById,
  updateBranch,
} from "./branch";
import { formatDateTime } from "./datetime";
import { execute, query, withTransaction } from "./db";
import {
  assertDaikaoAdmittable,
  clearDaikaoAdmitPending,
  getSourceDaikaoId,
  markDaikaoAdmitPending,
} from "./daikao";
import {
  applyPeopleCreate,
  applyPeopleDelete,
  applyPeopleUpdate,
  applySiblingReorder,
  clearYiziCache,
  getPeopleById,
  peopleToPayload,
} from "./people";
import {
  BranchPayload,
  ChangePayload,
  ChangeRequest,
  ObjectType,
  Operation,
  PeoplePayload,
  RequestStatus,
  Role,
  SessionUser,
} from "./types";
import { toTraditionalBranchPayload, toTraditionalPayload } from "./zh";

export type { ChangeRequest };

type RequestDb = RowDataPacket & {
  id: number;
  object_type: ObjectType;
  object_id: number | null;
  operation: Operation;
  status: RequestStatus;
  payload: string | ChangePayload;
  before_snapshot: string | ChangePayload | null;
  reject_reason: string | null;
  submitter_id: string;
  submitter_name: string;
  last_actor_id: string | null;
  last_actor_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  submitted_at: Date | string | null;
  approved_at: Date | string | null;
};

function parseJson<T>(v: string | T | null): T | null {
  if (v == null) return null;
  if (typeof v === "string") return JSON.parse(v) as T;
  return v;
}

function mapRequest(r: RequestDb): ChangeRequest {
  return {
    id: r.id,
    objectType: (r.object_type || "people") as ObjectType,
    objectId: r.object_id,
    operation: r.operation,
    status: r.status,
    payload: parseJson<ChangePayload>(r.payload) as ChangePayload,
    beforeSnapshot: parseJson<ChangePayload>(r.before_snapshot),
    rejectReason: r.reject_reason,
    submitterId: r.submitter_id,
    submitterName: r.submitter_name,
    lastActorId: r.last_actor_id,
    lastActorName: r.last_actor_name,
    createdAt: formatDateTime(r.created_at) || "",
    updatedAt: formatDateTime(r.updated_at) || "",
    submittedAt: formatDateTime(r.submitted_at),
    approvedAt: formatDateTime(r.approved_at),
  };
}

let branchEnumReady: Promise<void> | null = null;

/** 确保 object_type 支持 branch（兼容旧库） */
export async function ensureBranchObjectType() {
  if (!branchEnumReady) {
    branchEnumReady = (async () => {
      try {
        await execute(
          `ALTER TABLE app_change_requests
           MODIFY object_type ENUM('people','branch') NOT NULL DEFAULT 'people'`,
        );
      } catch {
        /* 已是目标定义或无权限时忽略 */
      }
    })();
  }
  await branchEnumReady;
}

function normalizePayload(
  objectType: ObjectType,
  payload: ChangePayload,
): ChangePayload {
  if (objectType === "branch") {
    return toTraditionalBranchPayload(payload as BranchPayload);
  }
  return toTraditionalPayload(payload as PeoplePayload);
}

async function addEvent(
  requestId: number,
  user: SessionUser,
  action: string,
  note?: string,
) {
  await execute(
    `INSERT INTO app_change_events
      (request_id, actor_id, actor_name, actor_role, action, note)
     VALUES (:requestId, :actorId, :actorName, :actorRole, :action, :note)`,
    {
      requestId,
      actorId: user.id,
      actorName: user.displayName,
      actorRole: user.role,
      action,
      note: note || null,
    },
  );
}

export async function createRequest(opts: {
  user: SessionUser;
  objectType?: ObjectType;
  operation: Operation;
  objectId?: number | null;
  payload: ChangePayload;
  submit?: boolean;
}) {
  if (opts.user.role !== "editor" && opts.user.role !== "admin") {
    throw new Error("仅录入员可发起变更");
  }

  const objectType: ObjectType = opts.objectType || "people";
  if (objectType === "branch") await ensureBranchObjectType();
  if (objectType === "branch" && opts.operation === "reorder") {
    throw new Error("派户支不支持排行调整");
  }

  const sourceDaikaoIdEarly = getSourceDaikaoId(opts.payload);
  if (
    objectType === "people" &&
    opts.operation === "create" &&
    sourceDaikaoIdEarly
  ) {
    await assertDaikaoAdmittable(sourceDaikaoIdEarly);
  }

  const payload = normalizePayload(objectType, opts.payload) as ChangePayload & {
    name?: string;
    childIds?: number[];
  };

  let before: ChangePayload | null = null;
  if (objectType === "people" && opts.operation === "reorder") {
    if (!opts.objectId) throw new Error("缺少父节点 ID");
    if (!payload.childIds?.length) throw new Error("缺少子节点顺序");
    const parent = await getPeopleById(opts.objectId);
    if (!parent) throw new Error("父节点不存在");
    before = peopleToPayload(parent);
    payload.name = payload.name || "排行調整";
  } else if (opts.operation !== "create") {
    if (!opts.objectId) {
      throw new Error(objectType === "branch" ? "缺少派户支 ID" : "缺少成员 ID");
    }
    if (objectType === "branch") {
      const branch = await getBranchById(opts.objectId);
      if (!branch) throw new Error("派户支不存在");
      before = branchToPayload(branch);
    } else {
      const person = await getPeopleById(opts.objectId);
      if (!person) throw new Error("成员不存在");
      before = peopleToPayload(person);
    }
  }

  // 同一对象 + 同操作：未完结单合并为一条
  if (opts.objectId && opts.operation !== "create") {
    const openRows = await query<RowDataPacket[]>(
      `SELECT id, status FROM app_change_requests
       WHERE object_type = :objectType
         AND object_id = :objectId
         AND operation = :operation
         AND status IN ('draft', 'pending_1', 'pending_2', 'pending_final', 'rejected')
       ORDER BY id DESC`,
      {
        objectType,
        objectId: opts.objectId,
        operation: opts.operation,
      },
    );
    if (openRows.length) {
      const keepId = Number(openRows[0].id);
      const prevStatus = String(openRows[0].status) as RequestStatus;
      for (const row of openRows.slice(1)) {
        const oldId = Number(row.id);
        await execute(
          `UPDATE app_change_requests SET
             status = 'rejected',
             reject_reason = :reason,
             last_actor_id = :actorId,
             last_actor_name = :actorName
           WHERE id = :id`,
          {
            id: oldId,
            reason: `已被变更单 #${keepId} 替代（同一成员重复提交）`,
            actorId: opts.user.id,
            actorName: opts.user.displayName,
          },
        );
        await addEvent(
          oldId,
          opts.user,
          "supersede",
          `合并至 #${keepId}`,
        );
      }

      let status: RequestStatus;
      if (opts.submit) {
        status = "pending_1";
      } else if (
        prevStatus === "pending_1" ||
        prevStatus === "pending_2" ||
        prevStatus === "pending_final"
      ) {
        status = prevStatus;
      } else {
        status = "draft";
      }

      await execute(
        `UPDATE app_change_requests SET
           payload = CAST(:payload AS JSON),
           before_snapshot = CAST(:beforeSnapshot AS JSON),
           status = :status,
           reject_reason = NULL,
           submitted_at = CASE
             WHEN :submit = 1 THEN NOW()
             ELSE submitted_at
           END,
           last_actor_id = :actorId,
           last_actor_name = :actorName
         WHERE id = :id`,
        {
          id: keepId,
          payload: JSON.stringify(payload),
          beforeSnapshot: before ? JSON.stringify(before) : null,
          status,
          submit: opts.submit ? 1 : 0,
          actorId: opts.user.id,
          actorName: opts.user.displayName,
        },
      );
      await addEvent(
        keepId,
        opts.user,
        opts.submit ? "submit" : "save",
        openRows.length > 1 ? `合并 ${openRows.length} 条待审单` : undefined,
      );
      clearYiziCache();
      return getRequestById(keepId);
    }
  }

  const status: RequestStatus = opts.submit ? "pending_1" : "draft";
  const result = await execute(
    `INSERT INTO app_change_requests
      (object_type, object_id, operation, status, payload, before_snapshot,
       submitter_id, submitter_name, last_actor_id, last_actor_name, submitted_at)
     VALUES (:objectType, :objectId, :operation, :status, CAST(:payload AS JSON),
             CAST(:beforeSnapshot AS JSON), :submitterId, :submitterName,
             :actorId, :actorName, :submittedAt)`,
    {
      objectType,
      objectId: opts.objectId ?? null,
      operation: opts.operation,
      status,
      payload: JSON.stringify(payload),
      beforeSnapshot: before ? JSON.stringify(before) : null,
      submitterId: opts.user.id,
      submitterName: opts.user.displayName,
      actorId: opts.user.id,
      actorName: opts.user.displayName,
      submittedAt: opts.submit ? new Date() : null,
    },
  );

  const id = result.insertId;
  await addEvent(id, opts.user, opts.submit ? "submit" : "draft");

  const sourceDaikaoId = getSourceDaikaoId(payload);
  if (
    objectType === "people" &&
    opts.operation === "create" &&
    sourceDaikaoId
  ) {
    await markDaikaoAdmitPending(sourceDaikaoId, id);
  }

  clearYiziCache();
  return getRequestById(id);
}

export async function updateRequestDraft(
  id: number,
  user: SessionUser,
  payload: ChangePayload,
  submit?: boolean,
) {
  const req = await getRequestById(id);
  if (!req) throw new Error("变更单不存在");
  if (req.submitterId !== user.id && user.role !== "admin") {
    throw new Error("只能编辑自己的变更单");
  }
  if (!["draft", "rejected"].includes(req.status)) {
    throw new Error("当前状态不可编辑");
  }

  const trad = normalizePayload(req.objectType, payload);
  const status: RequestStatus = submit ? "pending_1" : req.status === "rejected" ? "draft" : req.status;
  await execute(
    `UPDATE app_change_requests SET
      payload = CAST(:payload AS JSON),
      status = :status,
      reject_reason = CASE WHEN :submit = 1 THEN NULL ELSE reject_reason END,
      submitted_at = CASE WHEN :submit = 1 THEN NOW() ELSE submitted_at END,
      last_actor_id = :actorId,
      last_actor_name = :actorName
     WHERE id = :id`,
    {
      id,
      payload: JSON.stringify(trad),
      status: submit ? "pending_1" : status,
      submit: submit ? 1 : 0,
      actorId: user.id,
      actorName: user.displayName,
    },
  );
  await addEvent(id, user, submit ? "submit" : "save");
  const sourceDaikaoId = getSourceDaikaoId(trad);
  if (sourceDaikaoId && (submit || req.status === "draft" || req.status === "rejected")) {
    await markDaikaoAdmitPending(sourceDaikaoId, id);
  }
  return getRequestById(id);
}

export async function reviewerSave(
  id: number,
  user: SessionUser,
  payload: ChangePayload,
) {
  const req = await getRequestById(id);
  if (!req) throw new Error("变更单不存在");
  assertCanReview(user, req.status);
  const trad = normalizePayload(req.objectType, payload);
  await execute(
    `UPDATE app_change_requests SET
      payload = CAST(:payload AS JSON),
      last_actor_id = :actorId,
      last_actor_name = :actorName
     WHERE id = :id`,
    {
      id,
      payload: JSON.stringify(trad),
      actorId: user.id,
      actorName: user.displayName,
    },
  );
  await addEvent(id, user, "reviewer_save");
  return getRequestById(id);
}

export async function approveRequest(id: number, user: SessionUser) {
  const req = await getRequestById(id);
  if (!req) throw new Error("变更单不存在");
  assertCanReview(user, req.status);

  if (req.status === "pending_1") {
    await execute(
      `UPDATE app_change_requests SET status='pending_2', last_actor_id=:actorId, last_actor_name=:actorName WHERE id=:id`,
      { id, actorId: user.id, actorName: user.displayName },
    );
    await addEvent(id, user, "approve_1");
    return getRequestById(id);
  }
  if (req.status === "pending_2") {
    await execute(
      `UPDATE app_change_requests SET status='pending_final', last_actor_id=:actorId, last_actor_name=:actorName WHERE id=:id`,
      { id, actorId: user.id, actorName: user.displayName },
    );
    await addEvent(id, user, "approve_2");
    return getRequestById(id);
  }
  if (req.status === "pending_final") {
    if (req.objectType === "branch") {
      const bp = req.payload as BranchPayload;
      if (req.operation === "create") {
        const created = await createBranch(bp);
        await execute(
          `UPDATE app_change_requests SET status='approved', object_id=:objectId,
           approved_at=NOW(), last_actor_id=:actorId, last_actor_name=:actorName
           WHERE id=:id`,
          {
            id,
            objectId: created?.id ?? null,
            actorId: user.id,
            actorName: user.displayName,
          },
        );
      } else if (req.operation === "update") {
        if (!req.objectId) throw new Error("缺少派户支 ID");
        await updateBranch(req.objectId, bp);
        await execute(
          `UPDATE app_change_requests SET status='approved', approved_at=NOW(),
           last_actor_id=:actorId, last_actor_name=:actorName WHERE id=:id`,
          { id, actorId: user.id, actorName: user.displayName },
        );
      } else if (req.operation === "delete") {
        if (!req.objectId) throw new Error("缺少派户支 ID");
        await deleteBranch(req.objectId);
        await execute(
          `UPDATE app_change_requests SET status='approved', approved_at=NOW(),
           last_actor_id=:actorId, last_actor_name=:actorName WHERE id=:id`,
          { id, actorId: user.id, actorName: user.displayName },
        );
      } else {
        throw new Error("派户支不支持该操作");
      }
      await addEvent(id, user, "approve_final");
      return getRequestById(id);
    }

    await withTransaction(async (conn) => {
      const peoplePayload = req.payload as PeoplePayload;
      if (req.operation === "create") {
        const newId = await applyPeopleCreate(conn, peoplePayload);
        await conn.execute(
          `UPDATE app_change_requests SET status='approved', object_id=?, approved_at=NOW(),
           last_actor_id=?, last_actor_name=? WHERE id=?`,
          [newId, user.id, user.displayName, id],
        );
        const sourceDaikaoId = getSourceDaikaoId(peoplePayload);
        if (sourceDaikaoId) {
          // 事务外也会再写一次；此处用 conn 保证与落库同事务
          await conn.execute(
            `UPDATE tb_daikao_people SET
               admit_status = 'admitted',
               admit_request_id = ?,
               admitted_people_id = ?,
               admitted_at = NOW()
             WHERE id = ?`,
            [id, newId, sourceDaikaoId],
          );
        }
      } else if (req.operation === "update") {
        if (!req.objectId) throw new Error("缺少成员 ID");
        await applyPeopleUpdate(conn, req.objectId, peoplePayload);
        await conn.execute(
          `UPDATE app_change_requests SET status='approved', approved_at=NOW(),
           last_actor_id=?, last_actor_name=? WHERE id=?`,
          [user.id, user.displayName, id],
        );
      } else if (req.operation === "delete") {
        if (!req.objectId) throw new Error("缺少成员 ID");
        await applyPeopleDelete(conn, req.objectId);
        await conn.execute(
          `UPDATE app_change_requests SET status='approved', approved_at=NOW(),
           last_actor_id=?, last_actor_name=? WHERE id=?`,
          [user.id, user.displayName, id],
        );
      } else if (req.operation === "reorder") {
        if (!req.objectId) throw new Error("缺少父节点 ID");
        const childIds = peoplePayload.childIds || [];
        await applySiblingReorder(conn, req.objectId, childIds);
        await conn.execute(
          `UPDATE app_change_requests SET status='approved', approved_at=NOW(),
           last_actor_id=?, last_actor_name=? WHERE id=?`,
          [user.id, user.displayName, id],
        );
      }
      await conn.execute(
        `INSERT INTO app_change_events
          (request_id, actor_id, actor_name, actor_role, action, note)
         VALUES (?, ?, ?, ?, 'approve_final', NULL)`,
        [id, user.id, user.displayName, user.role],
      );
    });
    clearYiziCache();
    return getRequestById(id);
  }
  throw new Error("当前状态不可通过");
}

export async function rejectRequest(
  id: number,
  user: SessionUser,
  reason: string,
) {
  const req = await getRequestById(id);
  if (!req) throw new Error("变更单不存在");
  assertCanReview(user, req.status);
  if (!reason.trim()) throw new Error("请填写驳回原因");
  await execute(
    `UPDATE app_change_requests SET
      status='rejected', reject_reason=:reason,
      last_actor_id=:actorId, last_actor_name=:actorName
     WHERE id=:id`,
    {
      id,
      reason: reason.trim(),
      actorId: user.id,
      actorName: user.displayName,
    },
  );
  await addEvent(id, user, "reject", reason.trim());
  const sourceDaikaoId = getSourceDaikaoId(req.payload);
  if (sourceDaikaoId) {
    await clearDaikaoAdmitPending(sourceDaikaoId, id);
  }
  return getRequestById(id);
}

const PENDING_STATUSES: RequestStatus[] = [
  "pending_1",
  "pending_2",
  "pending_final",
];

function assertOwnOpenRequest(req: ChangeRequest, user: SessionUser) {
  if (req.submitterId !== user.id && user.role !== "admin") {
    throw new Error("只能操作自己的变更单");
  }
}

/** 录入员撤回已提交的审核：回到暂存，可再改 */
export async function withdrawRequest(id: number, user: SessionUser) {
  const req = await getRequestById(id);
  if (!req) throw new Error("变更单不存在");
  assertOwnOpenRequest(req, user);
  if (!PENDING_STATUSES.includes(req.status)) {
    throw new Error("仅待审状态可撤回提交");
  }
  await execute(
    `UPDATE app_change_requests SET
       status = 'draft',
       reject_reason = NULL,
       submitted_at = NULL,
       last_actor_id = :actorId,
       last_actor_name = :actorName
     WHERE id = :id`,
    {
      id,
      actorId: user.id,
      actorName: user.displayName,
    },
  );
  await addEvent(id, user, "withdraw", `从 ${req.status} 撤回为暂存`);
  // 撤回后仍为草稿：保持待考 pending，避免重复发起；删除/驳回才清空
  clearYiziCache();
  return getRequestById(id);
}

/** 删除未终审通过的变更单（不改正式库成员） */
export async function deleteOwnRequest(id: number, user: SessionUser) {
  const req = await getRequestById(id);
  if (!req) throw new Error("变更单不存在");
  assertOwnOpenRequest(req, user);
  if (req.status === "approved") {
    throw new Error("已通过的变更单不可删除");
  }
  const deletable: RequestStatus[] = [
    "draft",
    "rejected",
    ...PENDING_STATUSES,
  ];
  if (!deletable.includes(req.status)) {
    throw new Error("当前状态不可删除");
  }
  const sourceDaikaoId = getSourceDaikaoId(req.payload);
  await execute(`DELETE FROM app_change_requests WHERE id = :id`, { id });
  if (sourceDaikaoId) {
    await clearDaikaoAdmitPending(sourceDaikaoId, id);
  }
  clearYiziCache();
  return { ok: true as const, id };
}

function assertCanReview(user: SessionUser, status: RequestStatus) {
  if (user.role === "admin") return;
  if (status === "pending_1" && user.role === "first") return;
  if (status === "pending_2" && user.role === "second") return;
  if (status === "pending_final" && user.role === "final") return;
  throw new Error("当前账号无权审核该单据");
}

export async function getRequestById(id: number) {
  const rows = await query<RequestDb[]>(
    `SELECT * FROM app_change_requests WHERE id = :id LIMIT 1`,
    { id },
  );
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function listRequests(opts: {
  user: SessionUser;
  mode: "mine" | "review" | "all";
  status?: string;
  operation?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
  const offset = (page - 1) * pageSize;
  const where: string[] = ["1=1"];
  const params: Record<string, unknown> = {};

  if (opts.mode === "mine") {
    where.push("submitter_id = :uid");
    params.uid = opts.user.id;
  } else if (opts.mode === "review") {
    if (opts.user.role === "first") where.push("status = 'pending_1'");
    else if (opts.user.role === "second") where.push("status = 'pending_2'");
    else if (opts.user.role === "final") where.push("status = 'pending_final'");
    else if (opts.user.role === "admin") {
      where.push("status IN ('pending_1','pending_2','pending_final')");
    } else {
      where.push("1=0");
    }
  }

  if (opts.status) {
    where.push("status = :status");
    params.status = opts.status;
  }
  if (opts.operation) {
    where.push("operation = :operation");
    params.operation = opts.operation;
  }
  if (opts.q) {
    where.push(
      `(submitter_name LIKE :q OR CAST(payload AS CHAR) LIKE :q OR CAST(id AS CHAR) LIKE :q)`,
    );
    params.q = `%${opts.q}%`;
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM app_change_requests WHERE ${whereSql}`,
    params,
  );
  const rows = await query<RequestDb[]>(
    `SELECT * FROM app_change_requests
     WHERE ${whereSql}
     ORDER BY updated_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );
  return {
    total: Number(countRows[0]?.c || 0),
    page,
    pageSize,
    items: rows.map(mapRequest),
  };
}

export async function listEvents(requestId: number) {
  return query<RowDataPacket[]>(
    `SELECT id, actor_name, actor_role, action, note, created_at
     FROM app_change_events WHERE request_id = :requestId
     ORDER BY id ASC`,
    { requestId },
  );
}

export async function listWorkRecords(opts: {
  user: SessionUser;
  operation?: string;
  action?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
  const offset = (page - 1) * pageSize;
  const where = ["e.actor_id = :uid"];
  const params: Record<string, unknown> = { uid: opts.user.id };

  if (opts.operation) {
    where.push("r.operation = :operation");
    params.operation = opts.operation;
  }
  if (opts.action) {
    where.push("e.action = :action");
    params.action = opts.action;
  }
  if (opts.q) {
    where.push(`(e.note LIKE :q OR CAST(r.payload AS CHAR) LIKE :q OR CAST(r.id AS CHAR) LIKE :q)`);
    params.q = `%${opts.q}%`;
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
     FROM app_change_events e
     JOIN app_change_requests r ON r.id = e.request_id
     WHERE ${whereSql}`,
    params,
  );
  const rows = await query<RowDataPacket[]>(
    `SELECT e.id, e.action, e.note, e.created_at, e.actor_name, e.actor_role,
            r.id AS request_id, r.operation, r.status, r.object_id,
            JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.name')) AS people_name
     FROM app_change_events e
     JOIN app_change_requests r ON r.id = e.request_id
     WHERE ${whereSql}
     ORDER BY e.id DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );
  return {
    total: Number(countRows[0]?.c || 0),
    page,
    pageSize,
    items: rows,
  };
}

export function statusForRole(role: Role): RequestStatus | null {
  if (role === "first") return "pending_1";
  if (role === "second") return "pending_2";
  if (role === "final") return "pending_final";
  return null;
}
