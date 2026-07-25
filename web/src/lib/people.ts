import { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { execute, query } from "./db";
import {
  composeLegacyAlias,
  extractCourtesyFromDescription,
  normalizeCourtesyPart,
} from "./courtesy";
import { peopleToPayload } from "./people-client";
import { LineageNode, PeoplePayload, PeopleRow } from "./types";

export { peopleToPayload };
import {
  likeOrClause,
  rankLabelTraditional,
  searchTextVariants,
  toTraditional,
} from "./zh";

type PeopleDb = RowDataPacket & {
  F_ID: number;
  F_NAME: string;
  F_SEX: string;
  F_NO: string | null;
  F_LEVEL: number | null;
  F_GROUP: string | null;
  F_BIRTHDAY: string | null;
  F_DEATHDAY: string | null;
  F_ADDRESS: string | null;
  F_PINYIN: string | null;
  F_ALIAS: string | null;
  F_IS_HEIR: string | null;
  F_ORIGINAL_DATA: string | null;
  F_LNG_LAT: string | null;
  F_EDIT_TIME: string | null;
  F_PARENT_ID: number | null;
  F_PARENT_NAME: string | null;
  F_FATHER_ID: number | null;
  F_SPOUSE: string | null;
  F_SPOUSE_INFO: string | null;
  F_DESCRIPTION: string | null;
  F_VOLUME: string | null;
  F_PHONE: string | null;
  F_COMPANY: string | null;
  F_POSITION: string | null;
  F_PROFESSIONAL_TITLE: string | null;
  F_COLLEGE: string | null;
  F_DEGREE: string | null;
  child_count?: number;
  rank_label?: string | null;
  sibling_order?: number | null;
  birth_father_name?: string | null;
};

function mapRow(r: PeopleDb): PeopleRow {
  return {
    id: r.F_ID,
    name: r.F_NAME,
    sex: r.F_SEX,
    no: r.F_NO,
    level: r.F_LEVEL,
    groupName: r.F_GROUP,
    birthday: r.F_BIRTHDAY,
    deathday: r.F_DEATHDAY,
    address: r.F_ADDRESS,
    pinyin: r.F_PINYIN,
    alias: r.F_ALIAS ?? null,
    zi: null,
    hao: null,
    isHeir: r.F_IS_HEIR,
    originalData: r.F_ORIGINAL_DATA ?? null,
    lngLat: r.F_LNG_LAT ?? null,
    editTime: r.F_EDIT_TIME || null,
    parentId: r.F_PARENT_ID,
    parentName: r.F_PARENT_NAME,
    birthFatherId: r.F_FATHER_ID ?? null,
    birthFatherName: r.birth_father_name ?? null,
    rank: r.rank_label ?? null,
    siblingOrder: r.sibling_order ?? null,
    spouse: r.F_SPOUSE,
    spouseInfo: r.F_SPOUSE_INFO,
    description: r.F_DESCRIPTION,
    volume: r.F_VOLUME,
    phone: r.F_PHONE ?? null,
    company: r.F_COMPANY ?? null,
    position: r.F_POSITION ?? null,
    professionalTitle: r.F_PROFESSIONAL_TITLE ?? null,
    college: r.F_COLLEGE ?? null,
    degree: r.F_DEGREE ?? null,
    childCount: r.child_count ?? 0,
  };
}

/** 批量挂上每人最新变更单状态（按 id 最大 = 最近一次） */
async function attachLatestReviewStatus(
  people: PeopleRow[],
): Promise<PeopleRow[]> {
  if (!people.length) return people;
  try {
    if (!(await tableExists("app_change_requests"))) return people;
    const ids = people.map((p) => p.id);
    const placeholders = ids.map(() => "?").join(",");
    const rows = await query<RowDataPacket[]>(
      `SELECT cr.object_id AS id, cr.status, cr.id AS request_id
       FROM app_change_requests cr
       INNER JOIN (
         SELECT object_id, MAX(id) AS max_id
         FROM app_change_requests
         WHERE object_type = 'people'
           AND object_id IN (${placeholders})
         GROUP BY object_id
       ) t ON t.max_id = cr.id`,
      ids,
    );
    const map = new Map<number, { status: string; requestId: number }>();
    for (const r of rows) {
      map.set(Number(r.id), {
        status: String(r.status || ""),
        requestId: Number(r.request_id),
      });
    }
    return people.map((p) => {
      const hit = map.get(p.id);
      return {
        ...p,
        reviewStatus: hit?.status || null,
        reviewRequestId: hit?.requestId || null,
      };
    });
  } catch {
    return people.map((p) => ({
      ...p,
      reviewStatus: p.reviewStatus ?? null,
      reviewRequestId: p.reviewRequestId ?? null,
    }));
  }
}

export async function searchPeople(opts: {
  q?: string;
  name?: string;
  no?: string;
  level?: number;
  group?: string;
  sex?: string;
  address?: string;
  parentId?: number;
  /** 按最新变更单状态筛选 */
  auditStatus?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 10));
  const offset = (page - 1) * pageSize;
  const where: string[] = ["1=1"];
  const params: Record<string, unknown> = {};

  if (opts.parentId) {
    where.push("r.F_PARENT_ID = :parentId");
    params.parentId = opts.parentId;
  }
  if (opts.name) {
    where.push(
      likeOrClause(["p.F_NAME"], searchTextVariants(opts.name), "name", params),
    );
  }
  if (opts.no) {
    where.push("p.F_NO LIKE :no");
    params.no = `%${opts.no}%`;
  }
  if (opts.level) {
    where.push("p.F_LEVEL = :level");
    params.level = opts.level;
  }
  if (opts.group) {
    where.push(
      likeOrClause(
        ["p.F_GROUP"],
        searchTextVariants(opts.group),
        "groupName",
        params,
      ),
    );
  }
  if (opts.sex) {
    where.push("p.F_SEX = :sex");
    params.sex = toTraditional(opts.sex);
  }
  if (opts.address) {
    where.push(
      likeOrClause(
        ["p.F_ADDRESS"],
        searchTextVariants(opts.address),
        "address",
        params,
      ),
    );
  }
  if (opts.q) {
    const variants = searchTextVariants(opts.q);
    const parts: string[] = [];
    variants.forEach((v, i) => {
      const key = `q${i}`;
      params[key] = `%${v}%`;
      parts.push(
        `(p.F_NAME LIKE :${key} OR p.F_NO LIKE :${key} OR p.F_GROUP LIKE :${key})`,
      );
    });
    // 号码类关键词也按原文匹配
    params.qRaw = `%${opts.q.trim()}%`;
    parts.push(`p.F_NO LIKE :qRaw`);
    where.push(`(${parts.join(" OR ")})`);
  }

  const whereSql = where.join(" AND ");
  const hasRelation = await tableExists("tb_people_relation");

  if (opts.parentId && !hasRelation) {
    return { total: 0, page, pageSize, items: [] };
  }

  // 列表不 JOIN info：导入期 tb_people_info 写入很重，联表会拖到数秒～超时。
  // 详情抽屉走 getPeopleById。
  // COUNT 勿 JOIN relation：170 万行 LEFT JOIN 计数可达数秒；仅 parentId 筛选时才需要。
  const needRelationJoin = hasRelation && Boolean(opts.parentId);
  const joinRelationForCount = needRelationJoin
    ? "LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID"
    : "";
  const joinRelationForSelect = hasRelation
    ? "LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID"
    : "";
  const selectParent = hasRelation
    ? "r.F_PARENT_ID, r.F_PARENT_NAME, r.F_FATHER_ID"
    : "NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID";
  const selectChildCount = hasRelation
    ? "(SELECT COUNT(*) FROM tb_people_relation c WHERE c.F_PARENT_ID = p.F_ID) AS child_count"
    : `(SELECT COUNT(*) FROM tb_people c
        WHERE c.F_FLAG = p.F_FLAG
          AND c.F_LEFT > p.F_LEFT AND c.F_RIGHT < p.F_RIGHT
          AND c.F_LEVEL = p.F_LEVEL + 1) AS child_count`;

  // 审核状态筛选：只保留「最新变更单」匹配的人
  let auditJoin = "";
  if (opts.auditStatus) {
    auditJoin = `
      INNER JOIN (
        SELECT object_id, status
        FROM app_change_requests cr1
        WHERE cr1.object_type = 'people'
          AND cr1.id = (
            SELECT MAX(cr2.id) FROM app_change_requests cr2
            WHERE cr2.object_type = 'people' AND cr2.object_id = cr1.object_id
          )
      ) latest_cr ON latest_cr.object_id = p.F_ID AND latest_cr.status = :auditStatus`;
    params.auditStatus = opts.auditStatus;
  }

  const countRows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
     FROM tb_people p
     ${joinRelationForCount}
     ${auditJoin}
     WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.c || 0);

  const rows = await query<PeopleDb[]>(
    `SELECT p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
            ${selectParent},
            NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
            NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION, NULL AS F_PROFESSIONAL_TITLE,
            NULL AS F_COLLEGE, NULL AS F_DEGREE,
            ${selectChildCount}
     FROM tb_people p
     ${joinRelationForSelect}
     ${auditJoin}
     WHERE ${whereSql}
     ORDER BY p.F_ID ASC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  const items = await attachLatestReviewStatus(rows.map(mapRow));
  return { total, page, pageSize, items };
}

const tableExistsCache = new Map<string, boolean>();

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

let peopleIndexesReady = false;

/** 加速嵌套集「直接子代」。导入期勿在线建索引（会锁表）。 */
async function ensurePeopleIndexes() {
  if (peopleIndexesReady) return;
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT 1 AS ok FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'tb_people'
         AND index_name = 'idx_people_level_left'
       LIMIT 1`,
    );
    if (!rows.length) {
      await execute(
        `CREATE INDEX idx_people_level_left ON tb_people (F_LEVEL, F_LEFT)`,
      );
    }
  } catch {
    // 无权限或冲突时跳过
  }
  peopleIndexesReady = true;
}

let siblingTableReady = false;

export async function ensureSiblingOrderTable() {
  if (siblingTableReady) return;
  await execute(
    `CREATE TABLE IF NOT EXISTS app_sibling_order (
      people_id INT NOT NULL PRIMARY KEY,
      parent_id INT NOT NULL,
      sort_no INT NOT NULL DEFAULT 0,
      rank_label VARCHAR(20) NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sib_parent_sort (parent_id, sort_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  siblingTableReady = true;
}

let courtesyTableReady = false;

export async function ensureCourtesyTable() {
  if (courtesyTableReady) return;
  try {
    await execute(
      `CREATE TABLE IF NOT EXISTS app_people_courtesy (
      people_id INT NOT NULL PRIMARY KEY,
      zi VARCHAR(40) NOT NULL DEFAULT '',
      hao VARCHAR(40) NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    courtesyTableReady = true;
  } catch {
    // 导入期元数据锁时跳过建表，读路径降级为仅从描述抽取
  }
}

async function loadCourtesyMap(
  ids: number[],
): Promise<Map<number, { zi: string; hao: string }>> {
  const map = new Map<number, { zi: string; hao: string }>();
  if (!ids.length) return map;
  try {
    await ensureCourtesyTable();
    if (!courtesyTableReady) return map;
    const placeholders = ids.map(() => "?").join(",");
    const rows = await query<RowDataPacket[]>(
      `SELECT people_id, zi, hao FROM app_people_courtesy
     WHERE people_id IN (${placeholders})`,
      ids,
    );
    for (const r of rows) {
      map.set(Number(r.people_id), {
        zi: String(r.zi || ""),
        hao: String(r.hao || ""),
      });
    }
  } catch {
    // 表未就绪或查询失败时忽略，由描述预填
  }
  return map;
}

function stripCourtesyFromAliasDisplay(
  alias: string | null,
  zi: string,
  hao: string,
): string | null {
  let s = (alias || "").trim();
  if (!s) return null;
  if (zi) s = s.replace(new RegExp(`字${zi}\\s*`, "g"), "").trim();
  if (hao) s = s.replace(new RegExp(`[號号]${hao}\\s*`, "g"), "").trim();
  return s || null;
}

async function attachCourtesy(people: PeopleRow[]): Promise<PeopleRow[]> {
  if (!people.length) return people;
  let map = new Map<number, { zi: string; hao: string }>();
  try {
    map = await loadCourtesyMap(people.map((p) => p.id));
  } catch {
    map = new Map();
  }
  return people.map((p) => {
    const saved = map.get(p.id);
    let zi = saved?.zi || "";
    let hao = saved?.hao || "";
    // 未入库时从描述预填（只读展示/编辑初值，不改小传）
    if ((!zi || !hao) && p.description) {
      const extracted = extractCourtesyFromDescription(p.description);
      if (!zi) zi = extracted.zi;
      if (!hao) hao = extracted.hao;
    }
    // 旧 F_ALIAS 可能是「字×× 號××」，有独立字段后从别名里剥掉
    if ((!zi || !hao) && p.alias) {
      const fromAlias = extractCourtesyFromDescription(p.alias);
      if (!zi && fromAlias.zi) zi = fromAlias.zi;
      if (!hao && fromAlias.hao) hao = fromAlias.hao;
    }
    return {
      ...p,
      zi: zi || null,
      hao: hao || null,
      alias: stripCourtesyFromAliasDisplay(p.alias, zi, hao),
    };
  });
}

async function upsertCourtesy(
  conn: PoolConnection,
  peopleId: number,
  payload: PeoplePayload,
) {
  await ensureCourtesyTable();
  let zi = normalizeCourtesyPart("zi", payload.zi);
  let hao = normalizeCourtesyPart("hao", payload.hao);
  if ((!zi || !hao) && payload.description) {
    const extracted = extractCourtesyFromDescription(payload.description);
    if (!zi) zi = extracted.zi;
    if (!hao) hao = extracted.hao;
  }
  await conn.execute(
    `INSERT INTO app_people_courtesy (people_id, zi, hao)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE zi=VALUES(zi), hao=VALUES(hao)`,
    [peopleId, zi, hao],
  );
  // 兼容旧字段：同步拼到 F_ALIAS（其他别名仍保留在 payload.alias）
  const legacy = composeLegacyAlias(zi, hao, payload.alias || "");
  await conn.execute(`UPDATE tb_people SET F_ALIAS = ? WHERE F_ID = ?`, [
    legacy,
    peopleId,
  ]);
}

async function loadSiblingMeta(ids: number[]) {
  await ensureSiblingOrderTable();
  if (!ids.length) return new Map<number, { sortNo: number; rank: string; parentId: number }>();
  const placeholders = ids.map((_, i) => `:id${i}`).join(",");
  const params: Record<string, unknown> = {};
  ids.forEach((v, i) => {
    params[`id${i}`] = v;
  });
  const rows = await query<RowDataPacket[]>(
    `SELECT people_id, parent_id, sort_no, rank_label
     FROM app_sibling_order
     WHERE people_id IN (${placeholders})`,
    params,
  );
  const map = new Map<number, { sortNo: number; rank: string; parentId: number }>();
  for (const r of rows) {
    map.set(Number(r.people_id), {
      sortNo: Number(r.sort_no),
      rank: String(r.rank_label || ""),
      parentId: Number(r.parent_id),
    });
  }
  return map;
}

function sortByBirthOrder<T extends { id: number; no?: string | null; siblingOrder?: number | null }>(
  items: T[],
  meta?: Map<number, { sortNo: number; rank: string }>,
): T[] {
  return [...items].sort((a, b) => {
    const sa =
      a.siblingOrder ??
      meta?.get(a.id)?.sortNo ??
      Number.MAX_SAFE_INTEGER;
    const sb =
      b.siblingOrder ??
      meta?.get(b.id)?.sortNo ??
      Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    const na = a.no || "";
    const nb = b.no || "";
    if (na !== nb) return na < nb ? -1 : 1;
    return a.id - b.id;
  });
}

function annotateRanks(people: PeopleRow[]): PeopleRow[] {
  return people.map((p, idx) => ({
    ...p,
    siblingOrder: p.siblingOrder ?? idx,
    rank: p.rank || rankLabelTraditional(p.sex, idx),
  }));
}

async function attachSiblingMeta(people: PeopleRow[]): Promise<PeopleRow[]> {
  if (!people.length) return people;
  const meta = await loadSiblingMeta(people.map((p) => p.id));
  return people.map((p) => {
    const m = meta.get(p.id);
    if (!m) return p;
    return {
      ...p,
      siblingOrder: m.sortNo,
      rank: m.rank || p.rank,
    };
  });
}

export async function applySiblingReorder(
  conn: PoolConnection,
  parentId: number,
  childIds: number[],
) {
  await ensureSiblingOrderTable();
  if (!childIds.length) throw new Error("子节点列表为空");

  const hasRelation = await tableExists("tb_people_relation");
  let children: { id: number; sex: string }[] = [];
  if (hasRelation) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.F_ID AS id, p.F_SEX AS sex
       FROM tb_people_relation r
       JOIN tb_people p ON p.F_ID = r.F_PEOPLE_ID
       WHERE r.F_PARENT_ID = ?`,
      [parentId],
    );
    children = rows.map((r) => ({ id: Number(r.id), sex: String(r.sex) }));
  } else {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.F_ID AS id, p.F_SEX AS sex
       FROM tb_people parent
       JOIN tb_people p
         ON p.F_FLAG = parent.F_FLAG
        AND p.F_LEFT > parent.F_LEFT
        AND p.F_RIGHT < parent.F_RIGHT
        AND p.F_LEVEL = parent.F_LEVEL + 1
       WHERE parent.F_ID = ?`,
      [parentId],
    );
    children = rows.map((r) => ({ id: Number(r.id), sex: String(r.sex) }));
  }

  const childSet = new Set(children.map((c) => c.id));
  if (!childIds.length || childIds.some((id) => !childSet.has(id))) {
    throw new Error("排行调整包含无效子节点");
  }

  const meta = await loadSiblingMeta(children.map((c) => c.id));
  const currentOrder = sortByBirthOrder(
    children.map((c) => ({
      id: c.id,
      no: null as string | null,
      siblingOrder: meta.get(c.id)?.sortNo ?? null,
    })),
  ).map((c) => c.id);

  const provided = new Set(childIds);
  const rest = currentOrder.filter((id) => !provided.has(id));
  const finalOrder = [...childIds, ...rest];

  const sexMap = new Map(children.map((c) => [c.id, c.sex]));
  for (let i = 0; i < finalOrder.length; i++) {
    const id = finalOrder[i];
    const rank = rankLabelTraditional(sexMap.get(id) || "男", i);
    await conn.execute(
      `INSERT INTO app_sibling_order (people_id, parent_id, sort_no, rank_label)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), sort_no=VALUES(sort_no), rank_label=VALUES(rank_label)`,
      [id, parentId, i, rank],
    );
  }
  if (hasRelation) {
    await refreshParentChildren(conn, parentId);
  }
}

async function upsertPersonSiblingMeta(
  conn: PoolConnection,
  peopleId: number,
  parentId: number | null,
  payload: PeoplePayload,
) {
  if (!parentId) return;
  await ensureSiblingOrderTable();
  let sortNo = payload.siblingOrder;
  if (sortNo == null) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(sort_no), -1) AS m FROM app_sibling_order WHERE parent_id = ?`,
      [parentId],
    );
    sortNo = Number(rows[0]?.m ?? -1) + 1;
  }
  const rank =
    toTraditional(payload.rank || "") ||
    rankLabelTraditional(payload.sex, sortNo);
  await conn.execute(
    `INSERT INTO app_sibling_order (people_id, parent_id, sort_no, rank_label)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), sort_no=VALUES(sort_no), rank_label=VALUES(rank_label)`,
    [peopleId, parentId, sortNo, rank],
  );
}

/** relation 表未导入时，用同 F_FLAG 的 nested-set 推断直接父 */
async function findNestedParent(
  peopleId: number,
): Promise<{ id: number; name: string } | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT parent.F_ID AS id, parent.F_NAME AS name
     FROM tb_people cur
     JOIN tb_people parent
       ON parent.F_FLAG = cur.F_FLAG
      AND parent.F_LEFT < cur.F_LEFT
      AND parent.F_RIGHT > cur.F_RIGHT
      AND parent.F_LEVEL = cur.F_LEVEL - 1
     WHERE cur.F_ID = :id
     ORDER BY parent.F_LEFT DESC
     LIMIT 1`,
    { id: peopleId },
  );
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), name: String(rows[0].name) };
}

export async function getPeopleById(id: number): Promise<PeopleRow | null> {
  const hasRelation = await tableExists("tb_people_relation");
  const hasInfo = await tableExists("tb_people_info");
  const rows = await query<PeopleDb[]>(
    `SELECT p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
            ${hasRelation ? "r.F_PARENT_ID, r.F_PARENT_NAME, r.F_FATHER_ID" : "NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID"},
            ${
              hasInfo
                ? `i.F_SPOUSE, i.F_SPOUSE_INFO, i.F_DESCRIPTION, i.F_VOLUME,
                   i.F_PHONE, i.F_COMPANY, i.F_POSITION, i.F_PROFESSIONAL_TITLE, i.F_COLLEGE, i.F_DEGREE`
                : `NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
                   NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION, NULL AS F_PROFESSIONAL_TITLE,
                   NULL AS F_COLLEGE, NULL AS F_DEGREE`
            },
            ${
              hasRelation
                ? "(SELECT COUNT(*) FROM tb_people_relation c WHERE c.F_PARENT_ID = p.F_ID) AS child_count"
                : `(SELECT COUNT(*) FROM tb_people c
                    WHERE c.F_FLAG = p.F_FLAG
                      AND c.F_LEFT > p.F_LEFT AND c.F_RIGHT < p.F_RIGHT
                      AND c.F_LEVEL = p.F_LEVEL + 1) AS child_count`
            },
            ${
              hasRelation
                ? "(SELECT f.F_NAME FROM tb_people f WHERE f.F_ID = r.F_FATHER_ID LIMIT 1)"
                : "NULL"
            } AS birth_father_name
     FROM tb_people p
     ${hasRelation ? "LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID" : ""}
     ${hasInfo ? "LEFT JOIN tb_people_info i ON i.F_PEOPLE_ID = p.F_ID" : ""}
     WHERE p.F_ID = :id LIMIT 1`,
    { id },
  );
  if (!rows[0]) return null;
  let person = mapRow(rows[0]);
  try {
    [person] = await attachSiblingMeta([person]);
  } catch {
    // app_sibling_order 未就绪时忽略
  }

  // 导入数据父子在 nested-set，不一定有 relation / sibling_order；编辑表单需要回填
  try {
    if (!person.parentId) {
      const parent = await findNestedParent(id);
      if (parent) {
        person.parentId = parent.id;
        person.parentName = parent.name;
      }
    }
    if ((!person.rank || person.siblingOrder == null) && person.parentId) {
      const siblings = await getChildren(person.parentId);
      const idx = siblings.findIndex((s) => s.id === id);
      if (idx >= 0) {
        const self = siblings[idx];
        person.rank =
          person.rank || self.rank || rankLabelTraditional(person.sex, idx);
        person.siblingOrder =
          person.siblingOrder ?? self.siblingOrder ?? idx;
      }
    }
  } catch {
    // 导入抢锁时子代/父节点回填失败不阻断详情
  }

  try {
    const [withCourtesy] = await attachCourtesy([person]);
    return withCourtesy;
  } catch {
    return person;
  }
}

export async function getChildren(parentId: number) {
  const hasRelation = await tableExists("tb_people_relation");

  // 列表展开只需轻量字段，避免 JOIN info / 相关子查询拖慢
  const liteSelect = `p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
            NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
            NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION, NULL AS F_PROFESSIONAL_TITLE,
            NULL AS F_COLLEGE, NULL AS F_DEGREE,
            CASE WHEN (p.F_RIGHT - p.F_LEFT) > 1 THEN 1 ELSE 0 END AS child_count`;

  if (hasRelation) {
    const rows = await query<PeopleDb[]>(
      `SELECT ${liteSelect},
              r.F_PARENT_ID, r.F_PARENT_NAME, r.F_FATHER_ID
       FROM tb_people_relation r
       JOIN tb_people p ON p.F_ID = r.F_PEOPLE_ID
       WHERE r.F_PARENT_ID = :parentId
       ORDER BY p.F_LEFT ASC, p.F_NO ASC, p.F_ID ASC
       LIMIT 200`,
      { parentId },
    );
    const attached = await attachSiblingMeta(rows.map(mapRow));
    return attachLatestReviewStatus(annotateRanks(sortByBirthOrder(attached)));
  }

  // nested-set 按 F_FLAG 分树；左右值会跨派系重复，必须带 F_FLAG，否则会串支。
  await ensurePeopleIndexes();
  const parents = await query<
    (RowDataPacket & {
      F_LEFT: number;
      F_RIGHT: number;
      F_LEVEL: number;
      F_NAME: string;
      F_FLAG: number | null;
    })[]
  >(
    `SELECT F_LEFT, F_RIGHT, F_LEVEL, F_NAME, F_FLAG
     FROM tb_people WHERE F_ID = :parentId LIMIT 1`,
    { parentId },
  );
  const parent = parents[0];
  if (!parent) return [];

  // nested-set 直接子代 + 平台新增挂在末尾、靠 app_sibling_order 记父的节点
  await ensureSiblingOrderTable();
  const flag = Number(parent.F_FLAG || 0);
  const rows = await query<PeopleDb[]>(
    `SELECT ${liteSelect},
            :parentId AS F_PARENT_ID, :parentName AS F_PARENT_NAME,
            NULL AS F_FATHER_ID
     FROM tb_people p
     WHERE (
       (
         p.F_LEFT > :left AND p.F_RIGHT < :right AND p.F_LEVEL = :childLevel
         AND (:flag = 0 OR p.F_FLAG = :flag)
       )
       OR p.F_ID IN (SELECT people_id FROM app_sibling_order WHERE parent_id = :parentId)
     )
     ORDER BY p.F_LEFT ASC, p.F_NO ASC, p.F_ID ASC
     LIMIT 200`,
    {
      parentId,
      parentName: parent.F_NAME,
      left: Number(parent.F_LEFT),
      right: Number(parent.F_RIGHT),
      childLevel: Number(parent.F_LEVEL) + 1,
      flag,
    },
  );
  const attached = await attachSiblingMeta(rows.map(mapRow));
  return attachLatestReviewStatus(annotateRanks(sortByBirthOrder(attached)));
}

export async function applyPeopleCreate(
  conn: PoolConnection,
  payload: PeoplePayload,
) {
  const asParentOf = payload.asParentOf || null;
  if (asParentOf) {
    return applyPeopleCreateAsParent(conn, payload, asParentOf);
  }

  const parentId = payload.parentId || null;
  let level = payload.level ?? 1;
  let groupName = payload.group || "";
  let parentName = "";
  let parentNo = "";
  let flag = 0;

  if (parentId) {
    const [parents] = await conn.query<
      (RowDataPacket & {
        F_LEVEL: number | null;
        F_GROUP: string | null;
        F_NAME: string;
        F_NO: string | null;
        F_FLAG: number | null;
      })[]
    >(
      `SELECT F_LEVEL, F_GROUP, F_NAME, F_NO, F_FLAG
       FROM tb_people WHERE F_ID = ? LIMIT 1`,
      [parentId],
    );
    const parent = parents[0];
    if (!parent) throw new Error("父节点不存在");
    // 不在 nested-set 中间插入（170 万行全表移位会卡死）。
    // 挂到序列末尾，父子关系靠 relation / app_sibling_order 维护。
    level = payload.level ?? (parent.F_LEVEL || 0) + 1;
    groupName = payload.group || parent.F_GROUP || "";
    parentName = parent.F_NAME;
    parentNo = parent.F_NO || "";
    flag = parent.F_FLAG || parentId;
  }

  // left/right 先占位，插入后用 F_ID 回填，避免 MAX(F_RIGHT) 全表扫描（导入期可达数十秒）。
  // 真实父子靠 relation / app_sibling_order。
  const id = await insertPeopleRow(conn, payload, {
    left: 0,
    right: 0,
    level,
    groupName,
    flag,
    parentId: parentId || 0,
    parentName,
    parentNo,
  });

  await upsertPersonSiblingMeta(conn, id, parentId, payload);

  if (parentId && (await tableExists("tb_people_relation"))) {
    await refreshParentChildren(conn, parentId);
  }
  return id;
}

async function applyPeopleCreateAsParent(
  conn: PoolConnection,
  payload: PeoplePayload,
  childId: number,
) {
  // 禁止 nested-set 中间插入/整树抬层（会 UPDATE 百万行）。
  // 新父挂到序列末尾，再把目标子的 parent 指过来。
  const [children] = await conn.query<
    (RowDataPacket & {
      F_LEVEL: number | null;
      F_GROUP: string | null;
      F_FLAG: number | null;
      F_PARENT_ID: number | null;
      F_PARENT_NAME: string | null;
      F_PARENT_NO: string | null;
    })[]
  >(
    `SELECT p.F_LEVEL, p.F_GROUP, p.F_FLAG,
            r.F_PARENT_ID, r.F_PARENT_NAME, r.F_PARENT_NO
     FROM tb_people p
     LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID
     WHERE p.F_ID = ?
     LIMIT 1`,
    [childId],
  );
  const child = children[0];
  if (!child) throw new Error("目标成员不存在");

  const oldLevel = Number(child.F_LEVEL || 1);
  const oldParentId = Number(child.F_PARENT_ID || 0) || null;

  let parentName = "";
  let parentNo = "";
  let flag = Number(child.F_FLAG || 0);
  if (oldParentId) {
    const [parents] = await conn.query<
      (RowDataPacket & {
        F_NAME: string;
        F_NO: string | null;
        F_FLAG: number | null;
      })[]
    >(`SELECT F_NAME, F_NO, F_FLAG FROM tb_people WHERE F_ID = ? LIMIT 1`, [
      oldParentId,
    ]);
    const parent = parents[0];
    if (parent) {
      parentName = parent.F_NAME;
      parentNo = parent.F_NO || "";
      flag = parent.F_FLAG || oldParentId;
    }
  }

  const id = await insertPeopleRow(conn, payload, {
    left: 0,
    right: 0,
    level: payload.level ?? oldLevel,
    groupName: payload.group || child.F_GROUP || "",
    flag,
    parentId: oldParentId || 0,
    parentName,
    parentNo,
  });

  await ensureSiblingOrderTable();
  if (await tableExists("tb_people_relation")) {
    await conn.execute(
      `UPDATE tb_people_relation
       SET F_PARENT_ID = ?, F_PARENT_NAME = ?, F_PARENT_NO = ?
       WHERE F_PEOPLE_ID = ?`,
      [id, payload.name, payload.no || "", childId],
    );
  }
  await conn.execute(
    `UPDATE app_sibling_order SET parent_id = ? WHERE people_id = ?`,
    [id, childId],
  );
  // 子节点世系层级 +1（仅单行，不扫子树）
  await conn.execute(`UPDATE tb_people SET F_LEVEL = ? WHERE F_ID = ?`, [
    oldLevel + 1,
    childId,
  ]);

  await upsertPersonSiblingMeta(conn, id, oldParentId, payload);

  if (oldParentId && (await tableExists("tb_people_relation"))) {
    await refreshParentChildren(conn, oldParentId);
  }
  if (await tableExists("tb_people_relation")) {
    await refreshParentChildren(conn, id);
  }
  return id;
}

async function insertPeopleRow(
  conn: PoolConnection,
  payload: PeoplePayload,
  opts: {
    left: number;
    right: number;
    level: number;
    groupName: string;
    flag: number;
    parentId: number;
    parentName: string;
    parentNo: string;
  },
) {
  const zi = normalizeCourtesyPart("zi", payload.zi);
  const hao = normalizeCourtesyPart("hao", payload.hao);
  const legacyAlias = composeLegacyAlias(zi, hao, payload.alias || "");

  const [ins] = await conn.execute<ResultSetHeader>(
    `INSERT INTO tb_people
      (F_ADDRESS, F_ALIAS, F_BIRTHDAY, F_CHECK_ADMIN, F_CHECK_TIME, F_CREATE_ADMIN, F_CREATE_TIME,
       F_DEATHDAY, F_EDIT_ADMIN, F_EDIT_TIME, F_FLAG, F_GROUP, F_IS_HEIR, F_LEFT, F_LEVEL, F_NAME,
       F_NO, F_RIGHT, F_SEX, F_LNG_LAT, F_ORIGINAL_DATA, F_PINYIN)
     VALUES (?, ?, ?, '', '', 'platform', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'),
             ?, '', '', ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?)`,
    [
      payload.address || "",
      legacyAlias,
      payload.birthday || "",
      payload.deathday || "",
      opts.flag,
      opts.groupName,
      payload.isHeir || "0",
      opts.left,
      opts.level,
      payload.name,
      payload.no || "",
      opts.right,
      payload.sex,
      payload.lngLat || "",
      payload.originalData || "1",
      payload.pinyin || "",
    ],
  );
  const id = ins.insertId;
  // 用主键生成互不冲突的占位区间，避免读 MAX(F_RIGHT)
  await conn.execute(
    `UPDATE tb_people SET F_LEFT = ?, F_RIGHT = ? WHERE F_ID = ?`,
    [id * 2, id * 2 + 1, id],
  );

  if (await tableExists("tb_people_info")) {
    await conn.execute(
      `INSERT INTO tb_people_info
        (F_PEOPLE_ID, F_BIOGRAPHY, F_COLLEGE, F_COMPANY, F_DEGREE, F_DESCRIPTION, F_INDUSTRY,
         F_IS_FIRST_MOVE, F_MAJOR, F_POSITION, F_PROFESSIONAL_TITLE, F_SPOUSE, F_SPOUSE_INFO,
         F_VOLUME, F_PHONE, F_RESUME)
       VALUES (?, '', ?, ?, ?, ?, '', '0', '', ?, ?, ?, ?, ?, ?, '')`,
      [
        id,
        payload.college || "",
        payload.company || "",
        payload.degree || "",
        payload.description || "",
        payload.position || "",
        payload.professionalTitle || "",
        payload.spouse || "",
        payload.spouseInfo || "",
        payload.volume || "",
        payload.phone || "",
      ],
    );
  }

  if (await tableExists("tb_people_relation")) {
    await conn.execute(
      `INSERT INTO tb_people_relation
        (F_PEOPLE_ID, F_FATHER, F_PARENT_ID, F_PARENT_NAME, F_PARENT_NO, F_FATHER_ID, F_FATHER_NO, F_PINYIN)
       VALUES (?, '', ?, ?, ?, ?, '', ?)`,
      [
        id,
        opts.parentId,
        opts.parentName,
        opts.parentNo,
        payload.birthFatherId || 0,
        payload.pinyin || "",
      ],
    );
  }

  if (await tableExists("tb_people_ext")) {
    await conn.execute(
      `INSERT INTO tb_people_ext
        (F_PEOPLE_ID, F_CHILD_1, F_CHILD_10, F_CHILD_11, F_CHILD_12, F_CHILD_13, F_CHILD_14, F_CHILD_15,
         F_CHILD_2, F_CHILD_3, F_CHILD_4, F_CHILD_5, F_CHILD_6, F_CHILD_7, F_CHILD_8, F_CHILD_9,
         F_CHILDREN, F_OUT_CHILDREN, F_POSTERITY, F_SAMPLE_CHILDREN, F_SITUATION)
       VALUES (?, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '')`,
      [id],
    );
  }

  await upsertCourtesy(conn, id, payload);
  return id;
}

export async function applyPeopleUpdate(
  conn: PoolConnection,
  id: number,
  payload: PeoplePayload,
) {
  const legacyAlias = composeLegacyAlias(
    payload.zi || "",
    payload.hao || "",
    payload.alias || "",
  );
  await conn.execute(
    `UPDATE tb_people SET
      F_NAME = ?, F_SEX = ?, F_NO = ?, F_LEVEL = ?, F_GROUP = ?,
      F_BIRTHDAY = ?, F_DEATHDAY = ?, F_ADDRESS = ?, F_PINYIN = ?, F_ALIAS = ?,
      F_IS_HEIR = ?, F_ORIGINAL_DATA = ?, F_LNG_LAT = ?,
      F_EDIT_ADMIN = 'platform', F_EDIT_TIME = DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')
     WHERE F_ID = ?`,
    [
      payload.name,
      payload.sex,
      payload.no || "",
      payload.level ?? null,
      payload.group || "",
      payload.birthday || "",
      payload.deathday || "",
      payload.address || "",
      payload.pinyin || "",
      legacyAlias,
      payload.isHeir || "0",
      payload.originalData || "1",
      payload.lngLat || "",
      id,
    ],
  );
  await conn.execute(
    `UPDATE tb_people_info SET
      F_DESCRIPTION = ?, F_SPOUSE = ?, F_SPOUSE_INFO = ?, F_VOLUME = ?,
      F_PHONE = ?, F_COMPANY = ?, F_POSITION = ?, F_PROFESSIONAL_TITLE = ?,
      F_COLLEGE = ?, F_DEGREE = ?
     WHERE F_PEOPLE_ID = ?`,
    [
      payload.description || "",
      payload.spouse || "",
      payload.spouseInfo || "",
      payload.volume || "",
      payload.phone || "",
      payload.company || "",
      payload.position || "",
      payload.professionalTitle || "",
      payload.college || "",
      payload.degree || "",
      id,
    ],
  );
  await conn.execute(
    `UPDATE tb_people_relation
     SET F_PINYIN = ?, F_FATHER_ID = ?
     WHERE F_PEOPLE_ID = ?`,
    [payload.pinyin || "", payload.birthFatherId || 0, id],
  );

  if (payload.rank || payload.siblingOrder != null || payload.parentId) {
    let pid = payload.parentId || null;
    if (!pid && (await tableExists("tb_people_relation"))) {
      const [rels] = await conn.query<RowDataPacket[]>(
        `SELECT F_PARENT_ID FROM tb_people_relation WHERE F_PEOPLE_ID = ? LIMIT 1`,
        [id],
      );
      pid = Number(rels[0]?.F_PARENT_ID || 0) || null;
    }
    if (pid) {
      await upsertPersonSiblingMeta(conn, id, pid, payload);
      if (await tableExists("tb_people_relation")) {
        await refreshParentChildren(conn, pid);
      }
    }
  }

  await upsertCourtesy(conn, id, payload);
}

export async function applyPeopleDelete(conn: PoolConnection, id: number) {
  const [rows] = await conn.query<
    (RowDataPacket & {
      F_LEFT: number;
      F_RIGHT: number;
      F_PARENT_ID: number | null;
    })[]
  >(
    `SELECT p.F_LEFT, p.F_RIGHT, r.F_PARENT_ID
     FROM tb_people p
     LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID
     WHERE p.F_ID = ? FOR UPDATE`,
    [id],
  );
  const node = rows[0];
  if (!node) throw new Error("成员不存在");
  if (node.F_RIGHT - node.F_LEFT > 1) {
    throw new Error("该成员下仍有子代，请先处理子代后再删除");
  }

  const width = node.F_RIGHT - node.F_LEFT + 1;
  const ids = (
    await conn.query<RowDataPacket[]>(
      `SELECT F_ID FROM tb_people WHERE F_LEFT BETWEEN ? AND ?`,
      [node.F_LEFT, node.F_RIGHT],
    )
  )[0].map((r) => Number(r.F_ID));

  if (ids.length) {
    await conn.execute(
      `DELETE FROM tb_people_ext WHERE F_PEOPLE_ID IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    await conn.execute(
      `DELETE FROM tb_people_info WHERE F_PEOPLE_ID IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    await conn.execute(
      `DELETE FROM tb_people_relation WHERE F_PEOPLE_ID IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    await conn.execute(
      `DELETE FROM tb_people WHERE F_ID IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
  }

  await conn.execute(`UPDATE tb_people SET F_RIGHT = F_RIGHT - ? WHERE F_RIGHT > ?`, [
    width,
    node.F_RIGHT,
  ]);
  await conn.execute(`UPDATE tb_people SET F_LEFT = F_LEFT - ? WHERE F_LEFT > ?`, [
    width,
    node.F_RIGHT,
  ]);

  if (node.F_PARENT_ID) {
    await refreshParentChildren(conn, node.F_PARENT_ID);
  }
}

async function refreshParentChildren(conn: PoolConnection, parentId: number) {
  await ensureSiblingOrderTable();
  const [children] = await conn.query<
    (RowDataPacket & { F_NAME: string; F_NO: string | null })[]
  >(
    `SELECT p.F_NAME, p.F_NO
     FROM tb_people_relation r
     JOIN tb_people p ON p.F_ID = r.F_PEOPLE_ID
     LEFT JOIN app_sibling_order s ON s.people_id = p.F_ID
     WHERE r.F_PARENT_ID = ?
     ORDER BY COALESCE(s.sort_no, 999999) ASC, p.F_LEFT ASC, p.F_NO ASC, p.F_ID ASC
     LIMIT 15`,
    [parentId],
  );
  const slots = Array.from({ length: 15 }, (_, i) => {
    const c = children[i];
    return c ? `${c.F_NAME}${c.F_NO || ""}` : "";
  });
  const sample = children
    .slice(0, 3)
    .map((c) => `<子${["一", "二", "三"][children.indexOf(c)] || ""}${c.F_NAME}>`)
    .join("");
  const allText = children
    .map((c, idx) => `<子${["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][idx] || idx + 1}${c.F_NAME}${c.F_NO || ""}>`)
    .join("");

  await conn.execute(
    `UPDATE tb_people_ext SET
      F_CHILD_1=?, F_CHILD_2=?, F_CHILD_3=?, F_CHILD_4=?, F_CHILD_5=?,
      F_CHILD_6=?, F_CHILD_7=?, F_CHILD_8=?, F_CHILD_9=?, F_CHILD_10=?,
      F_CHILD_11=?, F_CHILD_12=?, F_CHILD_13=?, F_CHILD_14=?, F_CHILD_15=?,
      F_CHILDREN=?, F_SAMPLE_CHILDREN=?
     WHERE F_PEOPLE_ID=?`,
    [...slots, allText, sample, parentId],
  );
}

let statsMem: {
  at: number;
  data: {
    peopleTotal: number;
    branchTotal: number;
    draft: number;
    pending_1: number;
    pending_2: number;
    pending_final: number;
    rejected: number;
    approved: number;
  };
} | null = null;

export async function getDashboardStats() {
  if (statsMem && Date.now() - statsMem.at < 15_000) {
    return statsMem.data;
  }
  let peopleTotal = 0;
  let branchTotal = 0;
  if (await tableExists("tb_people")) {
    const peopleRows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM tb_people`,
    );
    peopleTotal = Number(peopleRows[0]?.c || 0);
  }
  if (await tableExists("tb_branch")) {
    const branchRows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM tb_branch`,
    );
    branchTotal = Number(branchRows[0]?.c || 0);
  }
  const statusRows = await query<RowDataPacket[]>(
    `SELECT status, COUNT(*) AS c FROM app_change_requests GROUP BY status`,
  );
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[String(r.status)] = Number(r.c);
  const data = {
    peopleTotal,
    branchTotal,
    draft: byStatus.draft || 0,
    pending_1: byStatus.pending_1 || 0,
    pending_2: byStatus.pending_2 || 0,
    pending_final: byStatus.pending_final || 0,
    rejected: byStatus.rejected || 0,
    approved: byStatus.approved || 0,
  };
  statsMem = { at: Date.now(), data };
  return data;
}

export type ChartPoint = { name: string; value: number; meta?: string };

type DashboardCharts = {
  levelBuckets: ChartPoint[];
  branchTop: ChartPoint[];
  sexPie: ChartPoint[];
  yearTrend: ChartPoint[];
  reviewPie: ChartPoint[];
  cachedAt?: string;
  stale?: boolean;
};

const CHART_CACHE_KEY = "dashboard_charts";
const CHART_FRESH_MS = 30 * 60 * 1000;
const CHART_STALE_MS = 24 * 60 * 60 * 1000;
let chartsMem: { at: number; data: DashboardCharts } | null = null;
let chartsRefreshing = false;

async function ensureCacheTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS app_cache (
      cache_key VARCHAR(64) NOT NULL PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function readChartCache(): Promise<{ data: DashboardCharts; at: number } | null> {
  if (chartsMem && Date.now() - chartsMem.at < CHART_FRESH_MS) {
    return { data: chartsMem.data, at: chartsMem.at };
  }
  try {
    await ensureCacheTable();
    const rows = await query<RowDataPacket[]>(
      `SELECT payload, updated_at FROM app_cache WHERE cache_key = :k LIMIT 1`,
      { k: CHART_CACHE_KEY },
    );
    if (!rows[0]) return null;
    const payload =
      typeof rows[0].payload === "string"
        ? (JSON.parse(rows[0].payload) as DashboardCharts)
        : (rows[0].payload as DashboardCharts);
    const at = new Date(String(rows[0].updated_at)).getTime();
    chartsMem = { at, data: payload };
    return { data: payload, at };
  } catch {
    return null;
  }
}

async function writeChartCache(data: DashboardCharts) {
  await ensureCacheTable();
  const withMeta = {
    ...data,
    cachedAt: new Date().toISOString(),
    stale: false,
  };
  await execute(
    `INSERT INTO app_cache (cache_key, payload, updated_at)
     VALUES (:k, CAST(:payload AS JSON), NOW())
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = NOW()`,
    { k: CHART_CACHE_KEY, payload: JSON.stringify(withMeta) },
  );
  chartsMem = { at: Date.now(), data: withMeta };
}

async function computeDashboardCharts(): Promise<DashboardCharts> {
  const empty: DashboardCharts = {
    levelBuckets: [],
    branchTop: [],
    sexPie: [],
    yearTrend: [],
    reviewPie: [],
  };
  if (!(await tableExists("tb_people"))) return empty;

  // Faster aggregates: avoid derived-table full scan style where possible
  const [levelRows, branchRows, sexRows, statusRows] = await Promise.all([
    query<RowDataPacket[]>(
      `SELECT FLOOR((IFNULL(F_LEVEL, 1) - 1) / 10) * 10 + 1 AS lo, COUNT(*) AS c
       FROM tb_people
       GROUP BY lo
       ORDER BY lo`,
    ),
    query<RowDataPacket[]>(
      `SELECT SUBSTRING_INDEX(F_GROUP, ',', 1) AS g, COUNT(*) AS c
       FROM tb_people
       WHERE F_GROUP IS NOT NULL AND F_GROUP <> ''
       GROUP BY g
       ORDER BY c DESC
       LIMIT 10`,
    ),
    query<RowDataPacket[]>(
      `SELECT IFNULL(NULLIF(F_SEX, ''), '未知') AS s, COUNT(*) AS c
       FROM tb_people
       GROUP BY s
       ORDER BY c DESC`,
    ),
    query<RowDataPacket[]>(
      `SELECT status, COUNT(*) AS c FROM app_change_requests GROUP BY status`,
    ),
  ]);

  // year trend is often empty/expensive; only run a cheap probe
  let yearRows: RowDataPacket[] = [];
  const probe = await query<RowDataPacket[]>(
    `SELECT F_CREATE_TIME AS t FROM tb_people
     WHERE F_CREATE_TIME IS NOT NULL AND F_CREATE_TIME <> ''
     LIMIT 1`,
  );
  if (probe.length) {
    yearRows = await query<RowDataPacket[]>(
      `SELECT LEFT(F_CREATE_TIME, 4) AS y, COUNT(*) AS c
       FROM tb_people
       WHERE F_CREATE_TIME REGEXP '^[0-9]{4}'
       GROUP BY y
       ORDER BY y ASC
       LIMIT 30`,
    );
  }

  const statusLabel: Record<string, string> = {
    draft: "暂存",
    pending_1: "待一审",
    pending_2: "待二审",
    pending_final: "待终审",
    approved: "已通过",
    rejected: "已驳回",
  };

  return {
    levelBuckets: levelRows.map((r) => {
      const lo = Number(r.lo);
      return {
        name: `第${lo}-${lo + 9}代`,
        value: Number(r.c),
        meta: String(lo),
      };
    }),
    branchTop: branchRows.map((r) => ({
      name: String(r.g).slice(0, 12),
      value: Number(r.c),
      meta: String(r.g),
    })),
    sexPie: sexRows.map((r) => ({
      name: String(r.s),
      value: Number(r.c),
    })),
    yearTrend: yearRows.map((r) => ({
      name: String(r.y),
      value: Number(r.c),
    })),
    reviewPie: statusRows.map((r) => ({
      name: statusLabel[String(r.status)] || String(r.status),
      value: Number(r.c),
    })),
  };
}

function refreshChartsInBackground() {
  if (chartsRefreshing) return;
  chartsRefreshing = true;
  computeDashboardCharts()
    .then((data) => writeChartCache(data))
    .catch(() => undefined)
    .finally(() => {
      chartsRefreshing = false;
    });
}

export async function getDashboardCharts() {
  const empty: DashboardCharts = {
    levelBuckets: [],
    branchTop: [],
    sexPie: [],
    yearTrend: [],
    reviewPie: [],
  };
  if (!(await tableExists("tb_people"))) return empty;

  const cached = await readChartCache();
  const age = cached ? Date.now() - cached.at : Infinity;

  if (cached && age < CHART_FRESH_MS) {
    return { ...cached.data, stale: false };
  }
  if (cached && age < CHART_STALE_MS) {
    refreshChartsInBackground();
    return { ...cached.data, stale: true };
  }

  const data = await computeDashboardCharts();
  await writeChartCache(data).catch(() => undefined);
  return data;
}

export async function getAncestors(id: number, maxUp = 8): Promise<PeopleRow[]> {
  // 优先直系父链；nested-set 仅作后备，并取最近 maxUp 代
  const viaParent = await getDirectAncestorLine(id, maxUp);
  if (viaParent.length) return viaParent;

  const rows = await query<PeopleDb[]>(
    `SELECT p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
            NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID,
            NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
            NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION,
            NULL AS F_PROFESSIONAL_TITLE, NULL AS F_COLLEGE, NULL AS F_DEGREE,
            0 AS child_count
     FROM tb_people cur
     JOIN tb_people p
       ON p.F_FLAG = cur.F_FLAG
      AND p.F_LEFT < cur.F_LEFT AND p.F_RIGHT > cur.F_RIGHT
     WHERE cur.F_ID = :id
     ORDER BY p.F_LEFT DESC
     LIMIT ${Math.max(1, maxUp)}`,
    { id },
  );
  return rows.map(mapRow).reverse();
}

function toLineageNode(p: PeopleRow): LineageNode {
  return {
    id: p.id,
    name: p.name,
    sex: p.sex,
    no: p.no,
    level: p.level,
    spouse: p.spouse,
    rank: p.rank || null,
    children: [],
  };
}

type PendingCreate = {
  requestId: number;
  name: string;
  sex: string;
  level: number | null;
  rank: string | null;
  parentId: number | null;
  asParentOf: number | null;
};

function pendingToNode(p: PendingCreate): LineageNode {
  return {
    id: -p.requestId,
    name: p.name || "（未命名）",
    sex: p.sex === "女" ? "女" : "男",
    no: null,
    level: p.level,
    spouse: null,
    rank: p.rank || "待审",
    children: [],
    pending: true,
    requestId: p.requestId,
  };
}

function walkInjectChild(
  node: LineageNode,
  parentId: number,
  child: LineageNode,
): boolean {
  if (node.id === parentId) {
    node.children = [...node.children, child];
    return true;
  }
  for (const c of node.children) {
    if (walkInjectChild(c, parentId, child)) return true;
  }
  return false;
}

async function loadPendingCreates(
  relatedIds: number[],
): Promise<PendingCreate[]> {
  if (!relatedIds.length) return [];
  const placeholders = relatedIds.map((_, i) => `:id${i}`).join(",");
  const params: Record<string, unknown> = {};
  relatedIds.forEach((v, i) => {
    params[`id${i}`] = v;
  });
  const rows = await query<RowDataPacket[]>(
    `SELECT id, payload
     FROM app_change_requests
     WHERE operation = 'create'
       AND status IN ('draft', 'pending_1', 'pending_2', 'pending_final')
       AND (
         CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.parentId')) AS UNSIGNED) IN (${placeholders})
         OR CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.asParentOf')) AS UNSIGNED) IN (${placeholders})
       )
     ORDER BY id ASC
     LIMIT 80`,
    params,
  );
  return rows.map((r) => {
    const payload =
      typeof r.payload === "string"
        ? (JSON.parse(r.payload) as PeoplePayload)
        : (r.payload as PeoplePayload);
    return {
      requestId: Number(r.id),
      name: String(payload.name || ""),
      sex: payload.sex === "女" ? "女" : "男",
      level: payload.level ?? null,
      rank: payload.rank || null,
      parentId: payload.parentId ? Number(payload.parentId) : null,
      asParentOf: payload.asParentOf ? Number(payload.asParentOf) : null,
    };
  });
}

type FlatNode = PeopleRow & { left: number; right: number };

function buildTreeFromFlat(
  focusId: number,
  flat: FlatNode[],
  maxDepth: number,
  maxChildren = 12,
): LineageNode {
  const sorted = [...flat].sort((a, b) => a.left - b.left);
  const nodes = new Map<number, LineageNode>();
  const childrenOf = new Map<number, number[]>();
  const stack: FlatNode[] = [];

  for (const item of sorted) {
    nodes.set(item.id, toLineageNode(item));
    while (stack.length && stack[stack.length - 1].right < item.left) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      if (!childrenOf.has(parent.id)) childrenOf.set(parent.id, []);
      childrenOf.get(parent.id)!.push(item.id);
    }
    stack.push(item);
  }

  function attach(id: number, depth: number): LineageNode {
    const node = nodes.get(id) || {
      id,
      name: "?",
      sex: "",
      no: null,
      level: null,
      spouse: null,
      rank: null,
      children: [],
    };
    if (depth >= maxDepth) {
      node.children = [];
      return node;
    }
    const kidIds = childrenOf.get(id) || [];
    const kidRows = kidIds
      .map((cid) => flat.find((f) => f.id === cid))
      .filter(Boolean) as FlatNode[];
    const ordered = sortByBirthOrder(kidRows).slice(0, maxChildren);
    node.children = ordered.map((k, idx) => {
      const child = attach(k.id, depth + 1);
      child.rank = k.rank || rankLabelTraditional(k.sex, idx);
      return child;
    });
    return node;
  }

  return attach(focusId, 0);
}

export async function getLineageTree(
  id: number,
  opts?: { up?: number; down?: number },
) {
  const up = Math.min(10, Math.max(0, opts?.up ?? 1));
  const down = Math.min(6, Math.max(0, opts?.down ?? 1));

  const focus = await getPeopleById(id);
  if (!focus) return null;

  const [ancestors, bounds] = await Promise.all([
    up > 0 ? getAncestors(id, up) : Promise.resolve([] as PeopleRow[]),
    query<RowDataPacket[]>(
      `SELECT F_LEFT AS l, F_RIGHT AS r, F_LEVEL AS lv, F_FLAG AS flag
       FROM tb_people WHERE F_ID = :id LIMIT 1`,
      { id },
    ),
  ]);

  const b = bounds[0];
  let tree: LineageNode = toLineageNode(focus);
  const relatedIds = new Set<number>([focus.id, ...ancestors.map((a) => a.id)]);

  if (b && down > 0) {
    const maxLevel = Number(b.lv || focus.level || 1) + down;
    const hasRelation = await tableExists("tb_people_relation");
    const hasInfo = await tableExists("tb_people_info");
    const rows = await query<(PeopleDb & { _left: number; _right: number })[]>(
      `SELECT p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
              p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
              p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
              p.F_LEFT AS _left, p.F_RIGHT AS _right,
              ${hasRelation ? "r.F_PARENT_ID, r.F_PARENT_NAME, r.F_FATHER_ID" : "NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID"},
              ${
                hasInfo
                  ? "i.F_SPOUSE, i.F_SPOUSE_INFO, i.F_DESCRIPTION, i.F_VOLUME, i.F_PHONE, i.F_COMPANY, i.F_POSITION, i.F_PROFESSIONAL_TITLE, i.F_COLLEGE, i.F_DEGREE"
                  : "NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME, NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION, NULL AS F_PROFESSIONAL_TITLE, NULL AS F_COLLEGE, NULL AS F_DEGREE"
              },
              0 AS child_count
       FROM tb_people p
       ${hasRelation ? "LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID" : ""}
       ${hasInfo ? "LEFT JOIN tb_people_info i ON i.F_PEOPLE_ID = p.F_ID" : ""}
       WHERE p.F_FLAG = :flag
         AND p.F_LEFT >= :l AND p.F_RIGHT <= :r
         AND p.F_LEVEL <= :maxLevel
       ORDER BY p.F_LEFT ASC
       LIMIT 200`,
      { l: Number(b.l), r: Number(b.r), maxLevel, flag: Number(b.flag || 0) },
    );
    const mappedRows = await attachSiblingMeta(rows.map(mapRow));
    const flat: FlatNode[] = mappedRows.map((mapped, i) => {
      relatedIds.add(mapped.id);
      return {
        ...mapped,
        left: Number(rows[i]._left),
        right: Number(rows[i]._right),
      };
    });
    tree = buildTreeFromFlat(focus.id, flat, down, 12);
  } else if (down > 0) {
    const kids = await getChildren(id);
    tree.children = kids.slice(0, 12).map((k, idx) => {
      relatedIds.add(k.id);
      const node = toLineageNode(k);
      node.rank = k.rank || rankLabelTraditional(k.sex, idx);
      return node;
    });
  }

  let reviewingIds: number[] = [];
  let pendingSiblings: LineageNode[] = [];
  /** 待审父节点：插在 asParentOf 正上方显示 */
  let pendingParents: { asParentOf: number; node: LineageNode }[] = [];
  try {
    const ids = [...relatedIds];
    if (ids.length) {
      const placeholders = ids.map((_, i) => `:id${i}`).join(",");
      const params: Record<string, unknown> = {};
      ids.forEach((v, i) => {
        params[`id${i}`] = v;
      });
      const reviewing = await query<RowDataPacket[]>(
        `SELECT DISTINCT object_id AS id
         FROM app_change_requests
         WHERE object_type = 'people'
           AND object_id IN (${placeholders})
           AND status IN ('draft', 'pending_1', 'pending_2', 'pending_final')
           AND operation IN ('update', 'delete', 'reorder')`,
        params,
      );
      reviewingIds = reviewing.map((r) => Number(r.id)).filter(Boolean);

      const pendingCreates = await loadPendingCreates(ids);
      for (const pc of pendingCreates) {
        const node = pendingToNode(pc);
        if (pc.asParentOf) {
          pendingParents.push({ asParentOf: pc.asParentOf, node });
          continue;
        }
        // 与中心同父的待审兄弟（中心树根下看不到同辈，单独列出）
        if (
          pc.parentId != null &&
          focus.parentId != null &&
          pc.parentId === focus.parentId
        ) {
          pendingSiblings.push(node);
          continue;
        }
        if (pc.parentId) {
          walkInjectChild(tree, pc.parentId, node);
        }
      }
    }
  } catch {
    reviewingIds = [];
    pendingSiblings = [];
    pendingParents = [];
  }

  return {
    focus,
    ancestors,
    tree,
    up,
    down,
    reviewingIds,
    pendingSiblings,
    pendingParents,
  };
}

function groupByGeneration(people: PeopleRow[], maxPerGen = 24) {
  const gens = new Map<number, PeopleRow[]>();
  for (const p of people) {
    const lv = p.level ?? 0;
    if (!gens.has(lv)) gens.set(lv, []);
    const arr = gens.get(lv)!;
    if (arr.length < maxPerGen) arr.push(p);
  }
  return [...gens.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, list]) => ({ level, people: list }));
}

/** 同辈图：按世代横排同辈 */
export async function getPeersChart(id: number) {
  const focus = await getPeopleById(id);
  if (!focus) return null;
  const ancestors = await getAncestors(id, 4);
  const focusLevel = focus.level ?? 1;
  const minLevel = Math.max(1, focusLevel - 3);
  const maxLevel = focusLevel + 3;

  const rows = await query<PeopleDb[]>(
    `SELECT p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
            NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID,
            NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
            NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION,
            NULL AS F_PROFESSIONAL_TITLE, NULL AS F_COLLEGE, NULL AS F_DEGREE,
            0 AS child_count
     FROM tb_people focus
     JOIN tb_people p
       ON p.F_FLAG = focus.F_FLAG
      AND p.F_LEFT >= focus.F_LEFT AND p.F_RIGHT <= focus.F_RIGHT
     WHERE focus.F_ID = :id
       AND p.F_LEVEL BETWEEN :minLevel AND :maxLevel
     ORDER BY p.F_LEVEL ASC, p.F_NO ASC, p.F_ID ASC
     LIMIT 160`,
    { id, minLevel, maxLevel },
  );

  if (rows.length < 2) {
    const people = [
      ...ancestors,
      focus,
      ...(await getChildren(focus.id)).slice(0, 40),
    ];
    return { focus, generations: groupByGeneration(people) };
  }

  const people = [...ancestors];
  const seen = new Set(people.map((p) => p.id));
  if (!seen.has(focus.id)) {
    people.push(focus);
    seen.add(focus.id);
  }
  for (const r of rows.map(mapRow)) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      people.push(r);
    }
  }
  return { focus, generations: groupByGeneration(people) };
}

/** @deprecated 使用 getPeersChart */
export const getYiziChart = getPeersChart;

const YIZI_SELECT = `p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
            NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID,
            NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
            NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION,
            NULL AS F_PROFESSIONAL_TITLE, NULL AS F_COLLEGE, NULL AS F_DEGREE,
            0 AS child_count`;

/** 直系父链：一次查出候选，每世取最紧包围节点（避免逐代全表扫） */
async function getDirectAncestorLine(
  id: number,
  maxUp: number,
): Promise<PeopleRow[]> {
  if (maxUp <= 0) return [];

  const hasRelation = await tableExists("tb_people_relation");
  if (hasRelation) {
    const chain: PeopleRow[] = [];
    let currentId = id;
    const seen = new Set<number>([id]);
    for (let i = 0; i < maxUp; i++) {
      const rows = await query<PeopleDb[]>(
        `SELECT ${YIZI_SELECT}
         FROM tb_people_relation r
         JOIN tb_people p ON p.F_ID = r.F_PARENT_ID
         WHERE r.F_PEOPLE_ID = :id AND IFNULL(r.F_PARENT_ID, 0) > 0
         LIMIT 1`,
        { id: currentId },
      );
      const parent = rows[0] ? mapRow(rows[0]) : null;
      if (!parent || seen.has(parent.id)) break;
      chain.unshift(parent);
      seen.add(parent.id);
      currentId = parent.id;
    }
    if (chain.length) return chain;
  }

  // nested-set：一次取 up 代内候选，每层保留跨度最小者
  const rows = await query<PeopleDb[]>(
    `SELECT ${YIZI_SELECT}
     FROM tb_people cur
     JOIN tb_people p
       ON p.F_FLAG = cur.F_FLAG
      AND p.F_LEFT < cur.F_LEFT AND p.F_RIGHT > cur.F_RIGHT
      AND p.F_LEVEL BETWEEN cur.F_LEVEL - :up AND cur.F_LEVEL - 1
     WHERE cur.F_ID = :id
     ORDER BY p.F_LEVEL ASC, (p.F_RIGHT - p.F_LEFT) ASC, p.F_ID ASC`,
    { id, up: maxUp },
  );
  const byLevel = new Map<number, PeopleRow>();
  for (const r of rows) {
    const m = mapRow(r);
    const lv = m.level ?? 0;
    if (!byLevel.has(lv)) byLevel.set(lv, m);
  }
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p)
    .slice(-maxUp);
}

/** 一字图向下：优先排行最左/出嗣，否则 nested-set 首子（F_LEFT = parent.left+1，极快） */
async function getYiziNextChild(parentId: number): Promise<PeopleRow | null> {
  try {
    await ensureSiblingOrderTable();
    const byRank = await query<PeopleDb[]>(
      `SELECT ${YIZI_SELECT}
       FROM app_sibling_order s
       JOIN tb_people p ON p.F_ID = s.people_id
       WHERE s.parent_id = :parentId
       ORDER BY s.sort_no ASC, p.F_ID ASC
       LIMIT 1`,
      { parentId },
    );
    if (byRank[0]) return mapRow(byRank[0]);
  } catch {
    // ignore
  }

  // nested-set 第一子：同 F_FLAG 树内 F_LEFT = parent.F_LEFT + 1
  const rows = await query<PeopleDb[]>(
    `SELECT ${YIZI_SELECT}
     FROM tb_people parent
     JOIN tb_people p
       ON p.F_FLAG = parent.F_FLAG
      AND p.F_LEFT = parent.F_LEFT + 1
      AND p.F_LEVEL = parent.F_LEVEL + 1
     WHERE parent.F_ID = :parentId
     LIMIT 1`,
    { parentId },
  );
  if (rows[0]) return mapRow(rows[0]);

  // 出嗣优先的轻量兜底（仍 LIMIT 1，避免拉全量子代）
  const heir = await query<PeopleDb[]>(
    `SELECT ${YIZI_SELECT}
     FROM tb_people parent
     JOIN tb_people p
       ON p.F_FLAG = parent.F_FLAG
      AND p.F_LEFT > parent.F_LEFT AND p.F_RIGHT < parent.F_RIGHT
      AND p.F_LEVEL = parent.F_LEVEL + 1
     WHERE parent.F_ID = :parentId
     ORDER BY CASE WHEN p.F_IS_HEIR = '1' THEN 0 ELSE 1 END,
              p.F_LEFT ASC, p.F_NO ASC, p.F_ID ASC
     LIMIT 1`,
    { parentId },
  );
  return heir[0] ? mapRow(heir[0]) : null;
}

type YiziPayload = {
  focus: PeopleRow;
  line: PeopleRow[];
  up: number;
  down: number;
  ancestorCount: number;
  descendantCount: number;
};

const yiziCache = new Map<string, { at: number; data: YiziPayload }>();

export function clearYiziCache() {
  yiziCache.clear();
}

/**
 * 一字图：自当前人上溯/下延各若干代，直系成一条线。
 * 向下沿长子（排行最左 / nested-set 首子）支线延伸。
 */
export async function getYiziLine(
  id: number,
  opts?: { up?: number; down?: number },
): Promise<YiziPayload | null> {
  const up = Math.min(20, Math.max(0, opts?.up ?? 5));
  const down = Math.min(20, Math.max(0, opts?.down ?? 5));
  const cacheKey = `${id}:${up}:${down}`;
  const hit = yiziCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;

  const focusRows = await query<PeopleDb[]>(
    `SELECT ${YIZI_SELECT}
     FROM tb_people p
     WHERE p.F_ID = :id
     LIMIT 1`,
    { id },
  );
  if (!focusRows[0]) return null;
  const focus = mapRow(focusRows[0]);

  const [ancestors, descendants] = await Promise.all([
    getDirectAncestorLine(id, up),
    (async () => {
      const list: PeopleRow[] = [];
      let cursorId = id;
      for (let i = 0; i < down; i++) {
        const next = await getYiziNextChild(cursorId);
        if (!next) break;
        list.push(next);
        cursorId = next.id;
      }
      return list;
    })(),
  ]);

  const data: YiziPayload = {
    focus,
    line: [...ancestors, focus, ...descendants],
    up,
    down,
    ancestorCount: ancestors.length,
    descendantCount: descendants.length,
  };
  yiziCache.set(cacheKey, { at: Date.now(), data });
  if (yiziCache.size > 500) {
    const oldest = [...yiziCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) yiziCache.delete(oldest[0]);
  }
  return data;
}

export async function ensureAppTables() {
  // no-op helper for health; real schema via deploy script
  await execute(`SELECT 1`);
}
