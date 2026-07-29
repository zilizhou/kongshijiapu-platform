import { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { formatDateTime } from "./datetime";
import { execute, query, withTransaction } from "./db";
import { likeOrClause, searchTextVariants, toTraditional } from "./zh";
import type { BranchPayload, BranchRow, RequestStatus } from "./types";
import { STATUS_LABEL } from "./types";

type BranchDb = RowDataPacket & {
  F_ID: number;
  F_BOOK: string | null;
  F_FLAG: number;
  F_FULL_NAME: string;
  F_LEFT: number;
  F_NAME: string;
  F_PARENT_ID: number | null;
  F_PERSON: string | null;
  F_REMARK: string | null;
  F_RIGHT: number;
  F_VOLUME: string | null;
  F_CREATE_TIME: Date | string | null;
  F_CREATE_USER: string | null;
  F_PERSON_PARENT_ID: number | null;
  F_PERSON_PARENT_NAME: string | null;
  F_PERSON_PARENT_NO: string | null;
  F_LEVEL: number | null;
  parent_name?: string | null;
  child_count?: number;
};

function mapBranch(r: BranchDb): BranchRow {
  return {
    id: Number(r.F_ID),
    book: r.F_BOOK || null,
    flag: Number(r.F_FLAG || 0),
    fullName: r.F_FULL_NAME || "",
    name: r.F_NAME || "",
    parentId: r.F_PARENT_ID ? Number(r.F_PARENT_ID) : null,
    parentName: r.parent_name || null,
    person: r.F_PERSON || null,
    remark: r.F_REMARK || null,
    volume: r.F_VOLUME || null,
    createTime: formatDateTime(r.F_CREATE_TIME),
    createUser: r.F_CREATE_USER || null,
    personParentId: r.F_PERSON_PARENT_ID ? Number(r.F_PERSON_PARENT_ID) : null,
    personParentName: r.F_PERSON_PARENT_NAME || null,
    personParentNo: r.F_PERSON_PARENT_NO || null,
    level: r.F_LEVEL != null ? Number(r.F_LEVEL) : null,
    left: Number(r.F_LEFT || 0),
    right: Number(r.F_RIGHT || 0),
    childCount: Number(r.child_count || 0),
    operation: "已生效",
    reviewStatus: "已生效",
  };
}

export function branchToPayload(b: BranchRow): BranchPayload {
  return {
    name: b.name,
    fullName: b.fullName,
    parentId: b.parentId,
    book: b.book || "",
    person: b.person || "",
    volume: b.volume || "",
    remark: b.remark || "",
    level: b.level,
    personParentId: b.personParentId,
    personParentName: b.personParentName || "",
    personParentNo: b.personParentNo || "",
  };
}

async function enrichBranchReviewStatus(items: BranchRow[]) {
  if (!items.length) return items;
  if (!(await tableExists("app_change_requests"))) return items;
  const ids = items.map((b) => b.id);
  const ph = ids.map(() => "?").join(",");
  const rows = await query<RowDataPacket[]>(
    `SELECT cr.object_id AS objectId, cr.status, cr.operation, cr.id AS requestId
     FROM app_change_requests cr
     INNER JOIN (
       SELECT object_id, MAX(id) AS mid
       FROM app_change_requests
       WHERE object_type = 'branch' AND object_id IN (${ph})
       GROUP BY object_id
     ) t ON t.mid = cr.id`,
    ids,
  );
  const map = new Map<
    number,
    { status: RequestStatus; operation: string; requestId: number }
  >();
  for (const r of rows) {
    map.set(Number(r.objectId), {
      status: String(r.status) as RequestStatus,
      operation: String(r.operation),
      requestId: Number(r.requestId),
    });
  }
  const opLabel: Record<string, string> = {
    create: "新增",
    update: "修改",
    delete: "删除",
  };
  return items.map((b) => {
    const cr = map.get(b.id);
    if (!cr) return b;
    const open = ["draft", "pending_1", "pending_2", "pending_final", "rejected"].includes(
      cr.status,
    );
    return {
      ...b,
      operation: opLabel[cr.operation] || cr.operation,
      reviewStatus: open
        ? STATUS_LABEL[cr.status]
        : cr.status === "approved"
          ? "已生效"
          : STATUS_LABEL[cr.status],
    };
  });
}

async function tableExists(name: string) {
  const rows = await query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :name LIMIT 1`,
    { name },
  );
  return rows.length > 0;
}

/**
 * 派户支选择器给的是 tb_branch.F_FULL_NAME（如「道溝戶費縣支」），
 * 人员表 F_GROUP 却是逗号分段（如「道溝戶,費縣支,零」）。
 * 本函数把查询词扩展成能匹配 F_GROUP 的模式列表（LIKE 子串匹配，支持只填户名）。
 */
export async function resolvePeopleGroupPatterns(
  input: string,
): Promise<string[]> {
  const raw = (input || "").trim();
  if (!raw) return [];

  // 始终保留原文/简繁变体：查询侧用 LIKE %词%，故「某戶」可命中其下各支
  const set = new Set<string>(searchTextVariants(raw));

  // 已有逗号：直接可用
  if (/[,，]/.test(raw)) {
    for (const v of [...set]) {
      set.add(v.replace(/，/g, ","));
    }
    return [...set];
  }

  if (!(await tableExists("tb_branch"))) {
    return [...set];
  }

  for (const v of searchTextVariants(raw)) {
    const hits = await query<
      (RowDataPacket & {
        F_ID: number;
        F_NAME: string;
        F_FULL_NAME: string;
        F_PARENT_ID: number | null;
      })[]
    >(
      `SELECT F_ID, F_NAME, F_FULL_NAME, F_PARENT_ID
       FROM tb_branch
       WHERE F_FULL_NAME = :v OR F_NAME = :v
          OR F_NAME LIKE :vLike OR F_FULL_NAME LIKE :vLike
       ORDER BY
         (F_NAME = :v) DESC,
         (F_FULL_NAME = :v) DESC,
         (F_NAME LIKE :vLike) DESC,
         F_ID ASC
       LIMIT 20`,
      { v, vLike: `%${v}%` },
    );

    for (const hit of hits) {
      const hitName = (hit.F_NAME || "").trim();
      // 户/派级节点：用短名做宽匹配，覆盖其下所有支
      if (hitName && /[戶户派]$/.test(hitName)) {
        for (const nv of searchTextVariants(hitName)) set.add(nv);
      }

      const parts: string[] = [];
      let curId: number | null = Number(hit.F_ID);
      const seen = new Set<number>();
      for (let depth = 0; depth < 20 && curId && !seen.has(curId); depth++) {
        seen.add(curId);
        type BranchLite = RowDataPacket & {
          F_ID: number;
          F_NAME: string;
          F_PARENT_ID: number | null;
        };
        const rows: BranchLite[] = await query<BranchLite[]>(
          `SELECT F_ID, F_NAME, F_PARENT_ID FROM tb_branch WHERE F_ID = :id LIMIT 1`,
          { id: curId },
        );
        const row: BranchLite | undefined = rows[0];
        if (!row) break;
        const parentId: number | null = row.F_PARENT_ID
          ? Number(row.F_PARENT_ID)
          : null;
        const nm = (row.F_NAME || "").trim();
        // 跳过始祖/中兴等总纲节点
        if (nm && curId > 2 && !/始祖|中興|中兴/.test(nm)) {
          parts.push(nm);
        }
        if (!parentId || parentId <= 2) break;
        curId = parentId;
      }
      parts.reverse();
      if (parts.length) {
        const joined = parts.join(",");
        set.add(joined);
        // 也匹配末尾带「,零」的常见写法
        set.add(`${joined},零`);
        // 路径中的户/派段单独加入，便于「只知户」命中
        for (const part of parts) {
          if (/[戶户派]$/.test(part)) {
            for (const nv of searchTextVariants(part)) set.add(nv);
          }
        }
      }
    }

    // 兜底：在「戶/派」与后续「支」之间插逗号
    const heur = v.replace(/([戶户派])(?=[^零,，])/g, "$1,");
    if (heur !== v) set.add(heur);
  }

  return [...set];
}

export async function searchBranches(opts: {
  name?: string;
  parentId?: number;
  level?: number;
  page?: number;
  pageSize?: number;
}) {
  if (!(await tableExists("tb_branch"))) {
    return { total: 0, page: 1, pageSize: 10, items: [] as BranchRow[] };
  }

  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 10));
  const offset = (page - 1) * pageSize;
  const where: string[] = ["1=1"];
  const params: Record<string, unknown> = {};

  if (opts.name?.trim()) {
    where.push(
      likeOrClause(
        ["b.F_NAME", "b.F_FULL_NAME"],
        searchTextVariants(opts.name),
        "name",
        params,
      ),
    );
  }
  if (opts.parentId != null && opts.parentId > 0) {
    where.push("b.F_PARENT_ID = :parentId");
    params.parentId = opts.parentId;
  }
  if (opts.level != null && Number.isFinite(opts.level)) {
    where.push("b.F_LEVEL = :level");
    params.level = opts.level;
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM tb_branch b WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.c || 0);

  const rows = await query<BranchDb[]>(
    `SELECT b.*, p.F_NAME AS parent_name,
            (SELECT COUNT(*) FROM tb_branch c WHERE c.F_PARENT_ID = b.F_ID) AS child_count
     FROM tb_branch b
     LEFT JOIN tb_branch p ON p.F_ID = b.F_PARENT_ID AND b.F_PARENT_ID > 0
     WHERE ${whereSql}
     ORDER BY b.F_LEFT ASC, b.F_ID ASC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  const items = await enrichBranchReviewStatus(rows.map(mapBranch));
  return { total, page, pageSize, items };
}

export async function listBranchOptions(q?: string) {
  if (!(await tableExists("tb_branch"))) return [] as { id: number; name: string; fullName: string }[];
  const params: Record<string, unknown> = {};
  let where = "1=1";
  if (q?.trim()) {
    where = likeOrClause(
      ["F_NAME", "F_FULL_NAME"],
      searchTextVariants(q),
      "q",
      params,
    );
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT F_ID AS id, F_NAME AS name, F_FULL_NAME AS fullName
     FROM tb_branch
     WHERE ${where}
     ORDER BY F_LEFT ASC
     LIMIT 200`,
    params,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name || ""),
    fullName: String(r.fullName || ""),
  }));
}

export async function getBranchById(id: number): Promise<BranchRow | null> {
  if (!(await tableExists("tb_branch"))) return null;
  const rows = await query<BranchDb[]>(
    `SELECT b.*, p.F_NAME AS parent_name,
            (SELECT COUNT(*) FROM tb_branch c WHERE c.F_PARENT_ID = b.F_ID) AS child_count
     FROM tb_branch b
     LEFT JOIN tb_branch p ON p.F_ID = b.F_PARENT_ID AND b.F_PARENT_ID > 0
     WHERE b.F_ID = :id
     LIMIT 1`,
    { id },
  );
  return rows[0] ? mapBranch(rows[0]) : null;
}

export async function updateBranch(id: number, payload: BranchPayload) {
  const existing = await getBranchById(id);
  if (!existing) throw new Error("派户支不存在");

  const name = toTraditional(payload.name || "").trim();
  if (!name) throw new Error("请填写派户支名称");

  // 编辑不改挂接关系，避免破坏 nested-set；改上级请走新增/迁移
  const fullName =
    toTraditional(payload.fullName || "").trim() || existing.fullName || name;

  await execute(
    `UPDATE tb_branch SET
      F_NAME = :name,
      F_FULL_NAME = :fullName,
      F_BOOK = :book,
      F_PERSON = :person,
      F_VOLUME = :volume,
      F_REMARK = :remark,
      F_LEVEL = :level,
      F_PERSON_PARENT_ID = :personParentId,
      F_PERSON_PARENT_NAME = :personParentName,
      F_PERSON_PARENT_NO = :personParentNo
     WHERE F_ID = :id`,
    {
      id,
      name,
      fullName,
      book: toTraditional(payload.book || "") || existing.book || "",
      person: toTraditional(payload.person || "") || "",
      volume: toTraditional(payload.volume || "") || "",
      remark: toTraditional(payload.remark || "") || "",
      level: payload.level ?? existing.level,
      personParentId: payload.personParentId ?? existing.personParentId ?? 0,
      personParentName: toTraditional(payload.personParentName || "") || "",
      personParentNo: payload.personParentNo || "",
    },
  );
  return getBranchById(id);
}

export async function deleteBranch(id: number) {
  const existing = await getBranchById(id);
  if (!existing) throw new Error("派户支不存在");
  if ((existing.childCount || 0) > 0) {
    throw new Error("该派户支下仍有子支，请先处理子支后再删除");
  }
  if (existing.right - existing.left > 1) {
    throw new Error("该派户支树节点非空，无法删除");
  }

  const width = existing.right - existing.left + 1;
  await withTransaction(async (conn) => {
    await conn.execute(`DELETE FROM tb_branch WHERE F_ID = ?`, [id]);
    await conn.execute(
      `UPDATE tb_branch SET F_RIGHT = F_RIGHT - ? WHERE F_RIGHT > ?`,
      [width, existing.right],
    );
    await conn.execute(
      `UPDATE tb_branch SET F_LEFT = F_LEFT - ? WHERE F_LEFT > ?`,
      [width, existing.right],
    );
  });
}

export async function createBranch(payload: BranchPayload) {
  const name = toTraditional(payload.name || "").trim();
  if (!name) throw new Error("请填写派户支名称");
  const parentId = payload.parentId || 0;
  const fullName = toTraditional(payload.fullName || "").trim() || name;
  const book = toTraditional(payload.book || "") || "";
  const volume = toTraditional(payload.volume || "") || "";

  const newId = await withTransaction(async (conn) => {
    let insertLeft = 0;
    let insertRight = 1;
    let fname = fullName;
    let fbook = book;
    let fvolume = volume;

    if (parentId) {
      const [parents] = await conn.query<BranchDb[]>(
        `SELECT * FROM tb_branch WHERE F_ID = ? FOR UPDATE`,
        [parentId],
      );
      const parent = parents[0];
      if (!parent) throw new Error("上级派户支不存在");
      const insertAt = Number(parent.F_RIGHT);
      await conn.execute(
        `UPDATE tb_branch SET F_RIGHT = F_RIGHT + 2 WHERE F_RIGHT >= ?`,
        [insertAt],
      );
      await conn.execute(
        `UPDATE tb_branch SET F_LEFT = F_LEFT + 2 WHERE F_LEFT > ?`,
        [insertAt],
      );
      insertLeft = insertAt;
      insertRight = insertAt + 1;
      if (!payload.fullName) fname = `${parent.F_FULL_NAME}${name}`;
      if (!book) fbook = parent.F_BOOK || "";
      if (!volume) fvolume = parent.F_VOLUME || "";
    } else {
      const [maxRows] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(MAX(F_RIGHT), -1) AS m FROM tb_branch FOR UPDATE`,
      );
      const maxRight = Number(maxRows[0]?.m ?? -1);
      insertLeft = maxRight + 1;
      insertRight = maxRight + 2;
    }

    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO tb_branch
        (F_BOOK, F_FLAG, F_FULL_NAME, F_LEFT, F_NAME, F_PARENT_ID, F_PERSON, F_REMARK,
         F_RIGHT, F_VOLUME, F_CREATE_TIME, F_CREATE_USER, F_PERSON_PARENT_ID,
         F_PERSON_PARENT_NAME, F_PERSON_PARENT_NO, F_LEVEL)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'platform', ?, ?, ?, ?)`,
      [
        fbook,
        fname,
        insertLeft,
        name,
        parentId || 0,
        toTraditional(payload.person || "") || "",
        toTraditional(payload.remark || "") || "",
        insertRight,
        fvolume,
        payload.personParentId || 0,
        toTraditional(payload.personParentName || "") || "",
        payload.personParentNo || "",
        payload.level ?? null,
      ],
    );
    return ins.insertId;
  });

  return getBranchById(newId);
}
