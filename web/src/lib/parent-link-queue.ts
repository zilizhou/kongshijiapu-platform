import { RowDataPacket } from "mysql2";
import { AuthError } from "./auth";
import {
  OfficialParentCandidate,
  OfficialParentResolve,
  resolveOfficialParent,
} from "./daikao";
import { execute, query, withTransaction } from "./db";
import {
  applyPeopleCreate,
  getPeopleById,
  linkPeopleToParent,
  searchPeople,
} from "./people";
import { PeoplePayload, Role, SessionUser } from "./types";
import { searchTextVariants } from "./zh";

const tableExistsCache = new Map<string, boolean>();
let queueTableReady = false;

async function tableExists(name: string) {
  const cached = tableExistsCache.get(name);
  if (cached != null) return cached;
  const rows = await query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :name
     LIMIT 1`,
    { name },
  );
  const ok = rows.length > 0;
  tableExistsCache.set(name, ok);
  return ok;
}

export async function ensureParentLinkQueueTable() {
  if (queueTableReady) return;
  if (!(await tableExists("tb_parent_link_queue"))) {
    await execute(
      `CREATE TABLE IF NOT EXISTS tb_parent_link_queue (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        people_id INT NOT NULL,
        parent_name_text VARCHAR(10) NOT NULL DEFAULT '',
        parent_no_text VARCHAR(20) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        chosen_parent_id INT NULL,
        match_hint VARCHAR(20) NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'kongtree1_import',
        operator_name VARCHAR(64) NULL,
        linked_at DATETIME NULL,
        note VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_plq_people (people_id),
        INDEX idx_plq_status (status),
        INDEX idx_plq_parent_name (parent_name_text)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  }
  queueTableReady = true;
}

export type ParentLinkStatus = "pending" | "linked" | "skipped";

export type ParentLinkRow = {
  id: number;
  peopleId: number;
  name: string;
  sex: string;
  level: number | null;
  groupName: string | null;
  address: string | null;
  parentNameText: string;
  parentNoText: string | null;
  currentParentId: number | null;
  status: ParentLinkStatus;
  chosenParentId: number | null;
  matchHint: string | null;
  operatorName: string | null;
  linkedAt: string | null;
  note: string | null;
};

type QueueDb = RowDataPacket & {
  id: number;
  people_id: number;
  parent_name_text: string;
  parent_no_text: string | null;
  status: string;
  chosen_parent_id: number | null;
  match_hint: string | null;
  operator_name: string | null;
  linked_at: string | Date | null;
  note: string | null;
  F_NAME: string;
  F_SEX: string;
  F_LEVEL: number | null;
  F_GROUP: string | null;
  F_ADDRESS: string | null;
  F_PARENT_ID: number | null;
};

function mapRow(r: QueueDb): ParentLinkRow {
  return {
    id: r.id,
    peopleId: r.people_id,
    name: r.F_NAME,
    sex: r.F_SEX || "男",
    level: r.F_LEVEL,
    groupName: r.F_GROUP,
    address: r.F_ADDRESS,
    parentNameText: r.parent_name_text || "",
    parentNoText: r.parent_no_text,
    currentParentId: r.F_PARENT_ID,
    status: (r.status as ParentLinkStatus) || "pending",
    chosenParentId: r.chosen_parent_id,
    matchHint: r.match_hint,
    operatorName: r.operator_name,
    linkedAt: r.linked_at ? String(r.linked_at) : null,
    note: r.note,
  };
}

export function canEditParentLink(role: Role) {
  return ["editor", "first", "second", "final", "admin"].includes(role);
}

export function assertCanEditParentLink(user: SessionUser) {
  if (!canEditParentLink(user.role)) {
    const err = new AuthError("当前角色不可操作挂接队列");
    err.status = 403;
    throw err;
  }
}

function groupPrefix(group: string | null | undefined) {
  const g = (group || "").trim();
  if (!g) return "";
  return g.split(",")[0]?.trim() || g;
}

/** 按子节点派户支/世代收窄父亲候选 */
export async function resolveScopedParent(
  parentNameRaw: string | null | undefined,
  child: { level: number | null; groupName: string | null },
): Promise<OfficialParentResolve> {
  const base = await resolveOfficialParent(parentNameRaw);
  const parentName = base.parentName;
  if (!parentName || !base.parentCandidates.length) return base;

  const childLevel = child.level;
  const prefix = groupPrefix(child.groupName);
  const scoped = base.parentCandidates.filter((p) => {
    if (childLevel != null && p.level != null && p.level !== childLevel - 1) {
      return false;
    }
    if (!prefix) return true;
    const g = (p.groupName || "").trim();
    if (!g) return false;
    return g === child.groupName || g.startsWith(prefix);
  });

  const list = scoped.length ? scoped : base.parentCandidates;
  if (scoped.length === 1) {
    return {
      parentId: scoped[0].id,
      parentMatch: "unique",
      parentName,
      parentCandidates: list,
    };
  }
  if (scoped.length > 1) {
    return {
      parentId: null,
      parentMatch: "ambiguous",
      parentName,
      parentCandidates: list,
    };
  }
  if (list.length === 1) {
    return {
      parentId: list[0].id,
      parentMatch: "unique",
      parentName,
      parentCandidates: list,
    };
  }
  if (list.length > 1) {
    return {
      parentId: null,
      parentMatch: "ambiguous",
      parentName,
      parentCandidates: list,
    };
  }
  return {
    parentId: null,
    parentMatch: "none",
    parentName,
    parentCandidates: [],
  };
}

export async function searchParentLinkQueue(opts: {
  name?: string;
  parentName?: string;
  group?: string;
  level?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  await ensureParentLinkQueueTable();
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
  const where: string[] = ["1=1"];
  const params: Record<string, unknown> = {};

  if (opts.name?.trim()) {
    where.push("p.F_NAME LIKE :name");
    params.name = `%${opts.name.trim()}%`;
  }
  if (opts.parentName?.trim()) {
    where.push("q.parent_name_text LIKE :parentName");
    params.parentName = `%${opts.parentName.trim()}%`;
  }
  if (opts.group?.trim()) {
    where.push("p.F_GROUP LIKE :group");
    params.group = `%${opts.group.trim()}%`;
  }
  if (opts.level?.trim()) {
    const n = Number(opts.level);
    if (!Number.isNaN(n)) {
      where.push("p.F_LEVEL = :level");
      params.level = n;
    }
  }
  if (opts.status != null && opts.status !== "") {
    where.push("q.status = :status");
    params.status = opts.status.trim();
  } else if (opts.status == null) {
    where.push("q.status = 'pending'");
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<(RowDataPacket & { c: number })[]>(
    `SELECT COUNT(*) AS c
     FROM tb_parent_link_queue q
     JOIN tb_people p ON p.F_ID = q.people_id
     LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = q.people_id
     WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.c || 0);
  const offset = (page - 1) * pageSize;

  const rows = await query<QueueDb[]>(
    `SELECT q.*, p.F_NAME, p.F_SEX, p.F_LEVEL, p.F_GROUP, p.F_ADDRESS,
            IFNULL(r.F_PARENT_ID, 0) AS F_PARENT_ID
     FROM tb_parent_link_queue q
     JOIN tb_people p ON p.F_ID = q.people_id
     LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = q.people_id
     WHERE ${whereSql}
     ORDER BY q.id ASC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  return {
    items: rows.map(mapRow),
    total,
    page,
    pageSize,
    pendingTotal: await countPending(),
  };
}

async function countPending() {
  const rows = await query<(RowDataPacket & { c: number })[]>(
    `SELECT COUNT(*) AS c FROM tb_parent_link_queue WHERE status = 'pending'`,
  );
  return Number(rows[0]?.c || 0);
}

export async function getParentLinkStats() {
  await ensureParentLinkQueueTable();
  const rows = await query<
    (RowDataPacket & { status: string; c: number })[]
  >(
    `SELECT status, COUNT(*) AS c FROM tb_parent_link_queue GROUP BY status`,
  );
  const map = Object.fromEntries(rows.map((r) => [r.status, Number(r.c)]));
  return {
    total: Object.values(map).reduce((a, b) => a + b, 0),
    pending: map.pending || 0,
    linked: map.linked || 0,
    skipped: map.skipped || 0,
  };
}

export type ParentLinkPreviewItem = {
  queueId: number;
  peopleId: number;
  name: string;
  sex: string;
  level: number | null;
  groupName: string | null;
  parentNameText: string;
  parentMatch: "none" | "unique" | "ambiguous";
  parentId: number | null;
  parentCandidates: OfficialParentCandidate[];
  ok: boolean;
  error?: string;
};

export async function previewParentLink(
  queueIds: number[],
): Promise<ParentLinkPreviewItem[]> {
  await ensureParentLinkQueueTable();
  if (!queueIds.length) return [];
  const ph = queueIds.map(() => "?").join(",");
  const rows = await query<QueueDb[]>(
    `SELECT q.*, p.F_NAME, p.F_SEX, p.F_LEVEL, p.F_GROUP, p.F_ADDRESS,
            IFNULL(r.F_PARENT_ID, 0) AS F_PARENT_ID
     FROM tb_parent_link_queue q
     JOIN tb_people p ON p.F_ID = q.people_id
     LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = q.people_id
     WHERE q.id IN (${ph})`,
    queueIds,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: ParentLinkPreviewItem[] = [];

  for (const id of queueIds) {
    const row = byId.get(id);
    if (!row) {
      out.push({
        queueId: id,
        peopleId: 0,
        name: "",
        sex: "",
        level: null,
        groupName: null,
        parentNameText: "",
        parentMatch: "none",
        parentId: null,
        parentCandidates: [],
        ok: false,
        error: "队列项不存在",
      });
      continue;
    }
    if (row.status !== "pending") {
      out.push({
        queueId: id,
        peopleId: row.people_id,
        name: row.F_NAME,
        sex: row.F_SEX,
        level: row.F_LEVEL,
        groupName: row.F_GROUP,
        parentNameText: row.parent_name_text,
        parentMatch: "none",
        parentId: null,
        parentCandidates: [],
        ok: false,
        error: `状态为 ${row.status}，不可重复挂接`,
      });
      continue;
    }
    const parent = await resolveScopedParent(row.parent_name_text, {
      level: row.F_LEVEL,
      groupName: row.F_GROUP,
    });
    let ok = true;
    let error: string | undefined;
    if (parent.parentMatch === "ambiguous") {
      ok = false;
      error = `父亲「${parent.parentName}」重名，请选择`;
    } else if (parent.parentName && parent.parentMatch === "none") {
      ok = false;
      error = `未找到父亲「${parent.parentName}」，请新建或手动选择`;
    }
    out.push({
      queueId: id,
      peopleId: row.people_id,
      name: row.F_NAME,
      sex: row.F_SEX,
      level: row.F_LEVEL,
      groupName: row.F_GROUP,
      parentNameText: row.parent_name_text,
      parentMatch: parent.parentMatch,
      parentId: parent.parentId,
      parentCandidates: parent.parentCandidates,
      ok,
      error,
    });
  }
  return out;
}

async function assertPendingQueue(peopleId: number) {
  const rows = await query<
    (RowDataPacket & { id: number; status: string; parent_name_text: string })[]
  >(
    `SELECT id, status, parent_name_text FROM tb_parent_link_queue WHERE people_id = :peopleId LIMIT 1`,
    { peopleId },
  );
  const row = rows[0];
  if (!row) throw new Error("不在挂接队列中");
  if (row.status !== "pending") throw new Error("该成员已处理");
  return row;
}

async function markLinked(
  peopleId: number,
  parentId: number,
  matchHint: string,
  operatorName: string,
) {
  await execute(
    `UPDATE tb_parent_link_queue SET
       status = 'linked',
       chosen_parent_id = :parentId,
       match_hint = :matchHint,
       operator_name = :operatorName,
       linked_at = NOW()
     WHERE people_id = :peopleId AND status = 'pending'`,
    { peopleId, parentId, matchHint, operatorName },
  );
}

export async function linkQueueToParent(opts: {
  peopleId: number;
  parentId: number;
  operatorName: string;
  matchHint?: string;
}) {
  await ensureParentLinkQueueTable();
  await assertPendingQueue(opts.peopleId);
  const parent = await getPeopleById(opts.parentId);
  if (!parent) throw new Error("所选父亲不存在");
  await linkPeopleToParent(opts.peopleId, opts.parentId);
  await markLinked(
    opts.peopleId,
    opts.parentId,
    opts.matchHint || "manual",
    opts.operatorName,
  );
  return { peopleId: opts.peopleId, parentId: opts.parentId };
}

export async function createParentAndLink(opts: {
  peopleId: number;
  operatorName: string;
  parentPayload?: Partial<PeoplePayload>;
}) {
  await ensureParentLinkQueueTable();
  const queueRow = await assertPendingQueue(opts.peopleId);
  const child = await getPeopleById(opts.peopleId);
  if (!child) throw new Error("成员不存在");

  const parentName =
    (opts.parentPayload?.name || queueRow.parent_name_text || "").trim();
  if (!parentName) throw new Error("父亲姓名不能为空");

  const payload: PeoplePayload = {
    name: parentName,
    sex: opts.parentPayload?.sex || "男",
    no: opts.parentPayload?.no || "",
    level:
      opts.parentPayload?.level ??
      (child.level != null ? child.level - 1 : null),
    group: opts.parentPayload?.group || child.groupName || "",
    address: opts.parentPayload?.address || "",
    asParentOf: opts.peopleId,
  };

  const parentId = await withTransaction(async (conn) => {
    const id = await applyPeopleCreate(conn, payload);
    return id;
  });

  await markLinked(opts.peopleId, parentId, "created", opts.operatorName);
  return { peopleId: opts.peopleId, parentId };
}

export async function skipParentLink(opts: {
  peopleId: number;
  operatorName: string;
  note?: string;
}) {
  await ensureParentLinkQueueTable();
  await assertPendingQueue(opts.peopleId);
  await execute(
    `UPDATE tb_parent_link_queue SET
       status = 'skipped',
       operator_name = :operatorName,
       note = :note,
       linked_at = NOW()
     WHERE people_id = :peopleId AND status = 'pending'`,
    {
      peopleId: opts.peopleId,
      operatorName: opts.operatorName,
      note: (opts.note || "").slice(0, 255),
    },
  );
}

export async function searchParentCandidates(opts: {
  name: string;
  childPeopleId?: number;
  page?: number;
  pageSize?: number;
}) {
  const name = opts.name.trim();
  if (!name) return { items: [] as OfficialParentCandidate[], total: 0 };

  let child: { level: number | null; groupName: string | null } | null = null;
  if (opts.childPeopleId) {
    const p = await getPeopleById(opts.childPeopleId);
    if (p) child = { level: p.level, groupName: p.groupName };
  }

  const found = await searchPeople({
    name,
    exactName: true,
    page: opts.page || 1,
    pageSize: opts.pageSize || 50,
  });
  const variants = new Set(searchTextVariants(name));
  let items = found.items
    .filter((x) => variants.has(x.name))
    .map((p) => ({
      id: p.id,
      name: p.name,
      sex: p.sex,
      level: p.level,
      groupName: p.groupName,
      parentName: p.parentName,
    }));

  if (child) {
    const prefix = groupPrefix(child.groupName);
    const scoped = items.filter((p) => {
      if (child!.level != null && p.level != null && p.level !== child!.level! - 1) {
        return false;
      }
      if (!prefix) return true;
      const g = (p.groupName || "").trim();
      return g && (g === child!.groupName || g.startsWith(prefix));
    });
    if (scoped.length) items = scoped;
  }

  return { items, total: items.length };
}
