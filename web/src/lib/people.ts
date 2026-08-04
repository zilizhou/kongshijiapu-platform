import { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { resolvePeopleGroupPatterns } from "./branch";
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
  parseRankToIndex,
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
  F_CREATE_TIME: string | null;
  F_CREATE_ADMIN: string | null;
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
    createTime: r.F_CREATE_TIME || null,
    createAdmin: r.F_CREATE_ADMIN || null,
    childCount: r.child_count ?? 0,
  };
}

/** 规范化录入时间；空则返回 "" */
export function normalizeCreateTime(
  input: string | null | undefined,
): string {
  const s = (input || "").trim().replace("T", " ");
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  return s;
}

function nowCreateTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function resolveCreateTime(payload: PeoplePayload): string {
  return normalizeCreateTime(payload.createTime) || nowCreateTime();
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

function pinyinLikeClause(
  column: string,
  input: string,
  paramPrefix: string,
  params: Record<string, unknown>,
): string {
  const raw = input.trim().toLowerCase();
  const compact = raw.replace(/\s+/g, "");
  const key = `${paramPrefix}`;
  const keyCompact = `${paramPrefix}Compact`;
  params[key] = `%${raw}%`;
  params[keyCompact] = `%${compact}%`;
  return `(LOWER(IFNULL(${column}, '')) LIKE :${key} OR REPLACE(LOWER(IFNULL(${column}, '')), ' ', '') LIKE :${keyCompact})`;
}

/** 是否像纯汉字姓名（不含拉丁字母）——此类不必扫拼音列 */
function looksLikeChineseName(input: string): boolean {
  const s = (input || "").trim();
  if (!s) return false;
  return /[\u4e00-\u9fff]/.test(s) && !/[a-zA-Z]/.test(s);
}

/** 姓名类条件：汉字只走 F_NAME（可走索引变体）；含字母时才兼查拼音 */
function nameOrPinyinClause(
  nameColumns: string[],
  pinyinColumn: string,
  input: string,
  paramPrefix: string,
  params: Record<string, unknown>,
): string {
  const namePart = likeOrClause(
    nameColumns,
    searchTextVariants(input),
    paramPrefix,
    params,
  );
  if (looksLikeChineseName(input)) return namePart;
  const pyPart = pinyinLikeClause(
    pinyinColumn,
    input,
    `${paramPrefix}Py`,
    params,
  );
  return `(${namePart} OR ${pyPart})`;
}

/** 姓名精确或前缀匹配（汉字检索与列表姓名条件一致） */
function personNameMatchSql(
  column: string,
  input: string,
  prefix: string,
  params: Record<string, unknown>,
): string {
  const variants = searchTextVariants(input);
  if (!variants.length) return "1=0";
  if (looksLikeChineseName(input)) {
    const parts: string[] = [];
    variants.forEach((v, i) => {
      params[`${prefix}E${i}`] = v;
      params[`${prefix}P${i}`] = `${v}%`;
      parts.push(`${column} = :${prefix}E${i}`);
      parts.push(`${column} LIKE :${prefix}P${i}`);
    });
    return `(${parts.join(" OR ")})`;
  }
  return nameOrPinyinClause([column], column.replace(/F_NAME$/, "F_PINYIN"), input, prefix, params);
}

/**
 * 父系范围条件：用 EXISTS，不预先截断同名父亲/子代 ID。
 * （局域网少数维护用户，检索须命中全部匹配行；列表仍按 pageSize 分页展示。）
 */
async function pushParentScopeExists(
  where: string[],
  params: Record<string, unknown>,
  opts: {
    parentId?: number;
    fatherName?: string;
    grandfatherName?: string;
  },
): Promise<boolean> {
  const parentId = opts.parentId && opts.parentId > 0 ? opts.parentId : 0;
  const fatherName = opts.fatherName?.trim() || "";
  const grandfatherName = opts.grandfatherName?.trim() || "";
  if (!parentId && !fatherName && !grandfatherName) return true;

  const hasRelation = await tableExists("tb_people_relation");
  let hasSibling = false;
  try {
    await ensureSiblingOrderTable();
    hasSibling = true;
  } catch {
    hasSibling = false;
  }
  if (!hasRelation && !hasSibling) return false;

  const orParts: string[] = [];

  if (parentId) {
    params.scopeParentId = parentId;
    if (hasRelation) {
      orParts.push(
        `EXISTS (
          SELECT 1 FROM tb_people_relation r_sp
          WHERE r_sp.F_PEOPLE_ID = p.F_ID AND r_sp.F_PARENT_ID = :scopeParentId
        )`,
      );
    }
    if (hasSibling) {
      orParts.push(
        `EXISTS (
          SELECT 1 FROM app_sibling_order s_sp
          WHERE s_sp.people_id = p.F_ID AND s_sp.parent_id = :scopeParentId
        )`,
      );
    }
    where.push(`(${orParts.join(" OR ")})`);
    orParts.length = 0;
  }

  if (fatherName && grandfatherName) {
    const fMatch = personNameMatchSql("f_af.F_NAME", fatherName, "afn", params);
    const gMatch = personNameMatchSql("gf_af.F_NAME", grandfatherName, "agn", params);
    if (hasRelation) {
      orParts.push(
        `EXISTS (
          SELECT 1 FROM tb_people_relation r_c
          INNER JOIN tb_people f_af ON f_af.F_ID = r_c.F_PARENT_ID
          INNER JOIN tb_people_relation r_f ON r_f.F_PEOPLE_ID = f_af.F_ID
          INNER JOIN tb_people gf_af ON gf_af.F_ID = r_f.F_PARENT_ID
          WHERE r_c.F_PEOPLE_ID = p.F_ID AND ${fMatch} AND ${gMatch}
        )`,
      );
    }
    if (hasSibling) {
      const fMatchS = personNameMatchSql("f_as.F_NAME", fatherName, "asn", params);
      const gMatchS = personNameMatchSql("gf_as.F_NAME", grandfatherName, "ags", params);
      orParts.push(
        `EXISTS (
          SELECT 1 FROM app_sibling_order s_c
          INNER JOIN tb_people f_as ON f_as.F_ID = s_c.parent_id
          INNER JOIN app_sibling_order s_f ON s_f.people_id = f_as.F_ID
          INNER JOIN tb_people gf_as ON gf_as.F_ID = s_f.parent_id
          WHERE s_c.people_id = p.F_ID AND ${fMatchS} AND ${gMatchS}
        )`,
      );
    }
    if (!orParts.length) return false;
    where.push(`(${orParts.join(" OR ")})`);
  } else if (fatherName) {
    const fMatch = personNameMatchSql("f_fn.F_NAME", fatherName, "fnm", params);
    if (hasRelation) {
      orParts.push(
        `EXISTS (
          SELECT 1 FROM tb_people_relation r_fn
          INNER JOIN tb_people f_fn ON f_fn.F_ID = r_fn.F_PARENT_ID
          WHERE r_fn.F_PEOPLE_ID = p.F_ID AND ${fMatch}
        )`,
      );
    }
    if (hasSibling) {
      const fMatchS = personNameMatchSql("f_fs.F_NAME", fatherName, "fsm", params);
      orParts.push(
        `EXISTS (
          SELECT 1 FROM app_sibling_order s_fn
          INNER JOIN tb_people f_fs ON f_fs.F_ID = s_fn.parent_id
          WHERE s_fn.people_id = p.F_ID AND ${fMatchS}
        )`,
      );
    }
    if (!orParts.length) return false;
    where.push(`(${orParts.join(" OR ")})`);
  } else if (grandfatherName) {
    const gMatch = personNameMatchSql("gf_gn.F_NAME", grandfatherName, "gnm", params);
    if (hasRelation) {
      orParts.push(
        `EXISTS (
          SELECT 1 FROM tb_people_relation r_g2
          INNER JOIN tb_people_relation r_g1 ON r_g1.F_PEOPLE_ID = r_g2.F_PARENT_ID
          INNER JOIN tb_people gf_gn ON gf_gn.F_ID = r_g1.F_PARENT_ID
          WHERE r_g2.F_PEOPLE_ID = p.F_ID AND ${gMatch}
        )`,
      );
    }
    if (hasSibling) {
      const gMatchS = personNameMatchSql("gf_gs.F_NAME", grandfatherName, "gsm", params);
      orParts.push(
        `EXISTS (
          SELECT 1 FROM app_sibling_order s_g2
          INNER JOIN app_sibling_order s_g1 ON s_g1.people_id = s_g2.parent_id
          INNER JOIN tb_people gf_gs ON gf_gs.F_ID = s_g1.parent_id
          WHERE s_g2.people_id = p.F_ID AND ${gMatchS}
        )`,
      );
    }
    if (!orParts.length) return false;
    where.push(`(${orParts.join(" OR ")})`);
  }

  return true;
}

export async function searchPeople(opts: {
  q?: string;
  name?: string;
  /** 姓名精确匹配（含简繁/异体变体），用于重名消歧 */
  exactName?: boolean;
  /** 父亲姓名（谱上父 / 当前父） */
  fatherName?: string;
  /** 祖父姓名（父之父） */
  grandfatherName?: string;
  /** 拼音（支持带空格或不带空格） */
  pinyin?: string;
  /** 字或号 */
  ziHao?: string;
  no?: string;
  level?: number;
  group?: string;
  sex?: string;
  address?: string;
  parentId?: number;
  /** 按最新变更单状态筛选 */
  auditStatus?: string;
  /** legacy=旧谱底库（非 platform）；platform=本平台新录 */
  dataSource?: "legacy" | "platform";
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  // 局域网维护场景：允许更大页以支持消歧/导出类全量拉取；列表 UI 仍可小页分页
  const pageSize = Math.min(10000, Math.max(1, opts.pageSize || 10));
  const offset = (page - 1) * pageSize;
  const where: string[] = ["1=1"];
  const params: Record<string, unknown> = {};

  const fatherName = opts.fatherName?.trim() || "";
  const grandfatherName = opts.grandfatherName?.trim() || "";
  const pinyin = opts.pinyin?.trim() || "";
  const ziHao = opts.ziHao?.trim() || "";
  const keyword = opts.q?.trim() || "";

  if (opts.name) {
    const nameVariants = searchTextVariants(opts.name);
    if (!nameVariants.length) {
      where.push("1=0");
    } else if (opts.exactName) {
      const parts = nameVariants.map((v, i) => {
        const key = `ename${i}`;
        params[key] = v;
        return `p.F_NAME = :${key}`;
      });
      where.push(`(${parts.join(" OR ")})`);
    } else if (looksLikeChineseName(opts.name)) {
      // 纯汉字：精确 + 前缀（可走 F_NAME 索引），避免 '%x%' 与拼音全表扫
      const parts: string[] = [];
      nameVariants.forEach((v, i) => {
        params[`ename${i}`] = v;
        params[`pname${i}`] = `${v}%`;
        parts.push(`p.F_NAME = :ename${i}`);
        parts.push(`p.F_NAME LIKE :pname${i}`);
      });
      where.push(`(${parts.join(" OR ")})`);
    } else {
      // 拼音/混合：姓名 LIKE + 拼音
      where.push(
        nameOrPinyinClause(["p.F_NAME"], "p.F_PINYIN", opts.name, "name", params),
      );
    }
  }

  // 父/祖父/指定父：EXISTS 全量匹配（不截断同名候选）；列表仍按 pageSize 分页
  {
    const ok = await pushParentScopeExists(where, params, {
      parentId: opts.parentId ? Number(opts.parentId) : undefined,
      fatherName,
      grandfatherName,
    });
    if (!ok) return { total: 0, page, pageSize, items: [] };
  }
  if (pinyin) {
    where.push(pinyinLikeClause("p.F_PINYIN", pinyin, "pinyin", params));
  }
  if (ziHao) {
    where.push(
      likeOrClause(
        ["courtesy.zi", "courtesy.hao", "p.F_ALIAS"],
        searchTextVariants(ziHao),
        "ziHao",
        params,
      ),
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
        await resolvePeopleGroupPatterns(opts.group),
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
  if (opts.dataSource === "platform") {
    where.push("p.F_CREATE_ADMIN = 'platform'");
  } else if (opts.dataSource === "legacy") {
    where.push("(p.F_CREATE_ADMIN IS NULL OR p.F_CREATE_ADMIN = '')");
  }
  if (keyword) {
    const variants = searchTextVariants(keyword);
    const parts: string[] = [];
    variants.forEach((v, i) => {
      const key = `q${i}`;
      params[key] = `%${v}%`;
      parts.push(
        `(p.F_NAME LIKE :${key} OR p.F_NO LIKE :${key} OR p.F_GROUP LIKE :${key} OR p.F_ALIAS LIKE :${key} OR p.F_ADDRESS LIKE :${key} OR courtesy.zi LIKE :${key} OR courtesy.hao LIKE :${key})`,
      );
    });
    // 号码类关键词也按原文匹配
    params.qRaw = `%${keyword}%`;
    parts.push(`p.F_NO LIKE :qRaw`);
    parts.push(pinyinLikeClause("p.F_PINYIN", keyword, "qPinyin", params));
    where.push(`(${parts.join(" OR ")})`);
  }

  const whereSql = where.join(" AND ");
  const hasRelation = await tableExists("tb_people_relation");

  if ((opts.parentId || fatherName || grandfatherName) && !hasRelation) {
    // 无 relation 时仍可能靠 sibling_order；若两边都空上面已返回
    try {
      await ensureSiblingOrderTable();
    } catch {
      return { total: 0, page, pageSize, items: [] };
    }
  }

  // 父亲检索前补齐缺 relation 的排行父子（每小时最多一次，不阻塞日常查询）
  if (hasRelation && (fatherName || opts.parentId)) {
    try {
      await repairMissingParentRelations();
    } catch {
      /* ignore */
    }
  }

  let needCourtesy = false;
  if (ziHao || keyword) {
    await ensureCourtesyTable();
    needCourtesy =
      courtesyTableReady || (await tableExists("app_people_courtesy"));
  }

  // 父系已改为 ID 预筛，主查询不再 JOIN relation / sibling_order
  const fromJoins = "";

  const courtesyJoin = needCourtesy
    ? "LEFT JOIN app_people_courtesy courtesy ON courtesy.people_id = p.F_ID"
    : "";

  // 关键字/字号条件引用了 courtesy.*；若表未就绪则改写条件避免 SQL 报错
  let finalWhereSql = whereSql;
  if (!needCourtesy && (ziHao || keyword)) {
    finalWhereSql = finalWhereSql
      .replace(/courtesy\.zi/g, "NULL")
      .replace(/courtesy\.hao/g, "NULL");
  }

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
     ${fromJoins}
     ${courtesyJoin}
     ${auditJoin}
     WHERE ${finalWhereSql}`,
    params,
  );
  const total = Number(countRows[0]?.c || 0);

  // 有姓名/父名等条件时：新录入（高 ID / platform）靠前，避免沉在末页「查不到」
  const hasLookupFilter = Boolean(
    opts.name ||
      fatherName ||
      grandfatherName ||
      keyword ||
      pinyin ||
      ziHao ||
      opts.no ||
      opts.address,
  );
  const orderBy = hasLookupFilter
    ? `ORDER BY (CASE WHEN IFNULL(p.F_CREATE_ADMIN,'') = 'platform' THEN 0 ELSE 1 END), p.F_ID DESC`
    : `ORDER BY p.F_ID ASC`;

  // 列表不联表算父亲/子代数：先取页内行，再批量补全（避免相关子查询 × 页大小）
  const rows = await query<PeopleDb[]>(
    `SELECT p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT,
            p.F_CREATE_TIME, p.F_CREATE_ADMIN, p.F_EDIT_TIME,
            NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID,
            NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
            NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION, NULL AS F_PROFESSIONAL_TITLE,
            NULL AS F_COLLEGE, NULL AS F_DEGREE,
            0 AS child_count
     FROM tb_people p
     ${fromJoins}
     ${courtesyJoin}
     ${auditJoin}
     WHERE ${finalWhereSql}
     ${orderBy}
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  let items = rows.map(mapRow);
  items = await attachListParentAndChildMeta(items);
  items = await attachLatestReviewStatus(items);
  return { total, page, pageSize, items };
}

/** 列表页：批量补全父亲与是否有子代（不拖慢主查询） */
async function attachListParentAndChildMeta(
  people: PeopleRow[],
): Promise<PeopleRow[]> {
  if (!people.length) return people;
  const ids = people.map((p) => p.id);
  const ph = ids.map(() => "?").join(",");
  const parentById = new Map<
    number,
    { parentId: number | null; parentName: string | null; birthFatherId: number | null }
  >();
  const childCount = new Map<number, number>();

  try {
    if (await tableExists("tb_people_relation")) {
      const rels = await query<RowDataPacket[]>(
        `SELECT F_PEOPLE_ID AS id, F_PARENT_ID AS parentId, F_PARENT_NAME AS parentName,
                F_FATHER_ID AS birthFatherId
         FROM tb_people_relation
         WHERE F_PEOPLE_ID IN (${ph})`,
        ids,
      );
      for (const r of rels) {
        parentById.set(Number(r.id), {
          parentId: Number(r.parentId || 0) || null,
          parentName: r.parentName ? String(r.parentName) : null,
          birthFatherId: Number(r.birthFatherId || 0) || null,
        });
      }
      const counts = await query<RowDataPacket[]>(
        `SELECT F_PARENT_ID AS id, COUNT(*) AS c
         FROM tb_people_relation
         WHERE F_PARENT_ID IN (${ph})
         GROUP BY F_PARENT_ID`,
        ids,
      );
      for (const r of counts) {
        childCount.set(Number(r.id), Number(r.c || 0));
      }
    }
  } catch {
    /* ignore */
  }

  try {
    await ensureSiblingOrderTable();
    const missingParent = ids.filter((id) => !parentById.get(id)?.parentId);
    if (missingParent.length) {
      const mph = missingParent.map(() => "?").join(",");
      const soRows = await query<RowDataPacket[]>(
        `SELECT s.people_id AS id, s.parent_id AS parentId, p.F_NAME AS parentName
         FROM app_sibling_order s
         LEFT JOIN tb_people p ON p.F_ID = s.parent_id
         WHERE s.people_id IN (${mph})`,
        missingParent,
      );
      for (const r of soRows) {
        const id = Number(r.id);
        if (parentById.get(id)?.parentId) continue;
        parentById.set(id, {
          parentId: Number(r.parentId || 0) || null,
          parentName: r.parentName ? String(r.parentName) : null,
          birthFatherId: parentById.get(id)?.birthFatherId ?? null,
        });
      }
    }
    const soCounts = await query<RowDataPacket[]>(
      `SELECT parent_id AS id, COUNT(*) AS c
       FROM app_sibling_order
       WHERE parent_id IN (${ph})
       GROUP BY parent_id`,
      ids,
    );
    for (const r of soCounts) {
      const id = Number(r.id);
      childCount.set(id, Math.max(childCount.get(id) || 0, Number(r.c || 0)));
    }
  } catch {
    /* ignore */
  }

  // 仍缺父名时用 nested-set 启发式：区间大于 1 视为有子代
  return people.map((p) => {
    const meta = parentById.get(p.id);
    const cc = childCount.get(p.id);
    return {
      ...p,
      parentId: meta?.parentId ?? p.parentId,
      parentName: meta?.parentName ?? p.parentName,
      birthFatherId: meta?.birthFatherId ?? p.birthFatherId,
      childCount: cc != null ? cc : p.childCount,
    };
  });
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

/**
 * 无 app_sibling_order 时，按同父兄弟顺序推断排行（与世系图/展开子代一致），供编辑表单回填。
 */
async function inferSiblingRankFromParent(
  peopleId: number,
  parentId: number,
  sex: string,
): Promise<{ siblingOrder: number; rank: string } | null> {
  const hasRelation = await tableExists("tb_people_relation");
  type Sib = { id: number; no: string | null; sex: string };
  let siblings: Sib[] = [];

  if (hasRelation) {
    const rows = await query<RowDataPacket[]>(
      `SELECT p.F_ID AS id, p.F_NO AS no, p.F_SEX AS sex
       FROM tb_people_relation r
       JOIN tb_people p ON p.F_ID = r.F_PEOPLE_ID
       WHERE r.F_PARENT_ID = :parentId`,
      { parentId },
    );
    siblings = rows.map((r) => ({
      id: Number(r.id),
      no: r.no != null ? String(r.no) : null,
      sex: String(r.sex || "男"),
    }));
  }

  try {
    await ensureSiblingOrderTable();
    const soRows = await query<RowDataPacket[]>(
      `SELECT s.people_id AS id, p.F_NO AS no, p.F_SEX AS sex, s.sort_no
       FROM app_sibling_order s
       JOIN tb_people p ON p.F_ID = s.people_id
       WHERE s.parent_id = :parentId`,
      { parentId },
    );
    const have = new Set(siblings.map((s) => s.id));
    for (const r of soRows) {
      const id = Number(r.id);
      if (have.has(id)) continue;
      siblings.push({
        id,
        no: r.no != null ? String(r.no) : null,
        sex: String(r.sex || "男"),
      });
    }
    const meta = await loadSiblingMeta(siblings.map((s) => s.id));
    siblings = sortByBirthOrder(
      siblings.map((s) => ({
        ...s,
        siblingOrder: meta.get(s.id)?.sortNo ?? null,
      })),
    );
  } catch {
    siblings = sortByBirthOrder(
      siblings.map((s) => ({ ...s, siblingOrder: null as number | null })),
    );
  }

  const idx = siblings.findIndex((s) => s.id === peopleId);
  if (idx < 0) return null;
  const s = siblings[idx];
  return {
    siblingOrder: idx,
    rank: rankLabelTraditional(s.sex || sex, idx),
  };
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

/**
 * 将某人写入/调整到同父兄弟排行中的目标位置，并重写全体 sort_no + rank_label。
 * 目标序：优先解析排行文案，其次 siblingOrder；皆空则保持原位或追加末尾。
 */
async function upsertPersonSiblingMeta(
  conn: PoolConnection,
  peopleId: number,
  parentId: number | null,
  payload: PeoplePayload,
) {
  if (!parentId) return;
  await ensureSiblingOrderTable();

  const hasRelation = await tableExists("tb_people_relation");
  let siblings: { id: number; sex: string }[] = [];
  if (hasRelation) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.F_ID AS id, p.F_SEX AS sex
       FROM tb_people_relation r
       JOIN tb_people p ON p.F_ID = r.F_PEOPLE_ID
       WHERE r.F_PARENT_ID = ?`,
      [parentId],
    );
    siblings = rows.map((r) => ({ id: Number(r.id), sex: String(r.sex) }));
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
    siblings = rows.map((r) => ({ id: Number(r.id), sex: String(r.sex) }));
  }

  // 兼收 sibling_order 中已挂靠、但 relation 暂缺的兄弟
  const [soSiblings] = await conn.query<RowDataPacket[]>(
    `SELECT s.people_id AS id, p.F_SEX AS sex
     FROM app_sibling_order s
     JOIN tb_people p ON p.F_ID = s.people_id
     WHERE s.parent_id = ?`,
    [parentId],
  );
  for (const r of soSiblings) {
    const id = Number(r.id);
    if (!siblings.some((s) => s.id === id)) {
      siblings.push({ id, sex: String(r.sex || "男") });
    }
  }

  if (!siblings.some((s) => s.id === peopleId)) {
    siblings.push({
      id: peopleId,
      sex: payload.sex === "女" ? "女" : "男",
    });
  }

  const meta = await loadSiblingMeta(siblings.map((s) => s.id));
  let order = sortByBirthOrder(
    siblings.map((s) => ({
      id: s.id,
      no: null as string | null,
      siblingOrder: meta.get(s.id)?.sortNo ?? null,
    })),
  ).map((s) => s.id);

  if (!order.includes(peopleId)) order.push(peopleId);

  const parsed = parseRankToIndex(payload.rank || "");
  let targetSort =
    parsed != null
      ? parsed
      : payload.siblingOrder != null
        ? Number(payload.siblingOrder)
        : order.indexOf(peopleId);
  if (!Number.isFinite(targetSort) || targetSort < 0) {
    targetSort = order.length - 1;
  }
  targetSort = Math.max(0, Math.min(Math.floor(targetSort), order.length - 1));

  order = order.filter((id) => id !== peopleId);
  order.splice(targetSort, 0, peopleId);

  const sexMap = new Map(siblings.map((s) => [s.id, s.sex]));
  sexMap.set(peopleId, payload.sex === "女" ? "女" : "男");

  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const sex = sexMap.get(id) || "男";
    const rank = rankLabelTraditional(sex, i);
    await conn.execute(
      `INSERT INTO app_sibling_order (people_id, parent_id, sort_no, rank_label)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), sort_no=VALUES(sort_no), rank_label=VALUES(rank_label)`,
      [id, parentId, i, rank],
    );
  }
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
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT,
            p.F_CREATE_TIME, p.F_CREATE_ADMIN, p.F_EDIT_TIME,
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
    // 排行：优先 app_sibling_order；旧谱常无此表行，则按同父兄弟顺序推断（与世系图一致）
    if (person.parentId) {
      try {
        await ensureSiblingOrderTable();
        const so = await query<RowDataPacket[]>(
          `SELECT sort_no, rank_label FROM app_sibling_order
           WHERE people_id = :id LIMIT 1`,
          { id },
        );
        if (so[0]) {
          person.siblingOrder = Number(so[0].sort_no);
          person.rank =
            String(so[0].rank_label || "") ||
            rankLabelTraditional(person.sex, Number(so[0].sort_no) || 0);
        } else if (person.siblingOrder == null || !person.rank) {
          const inferred = await inferSiblingRankFromParent(
            id,
            person.parentId,
            person.sex,
          );
          if (inferred) {
            person.siblingOrder =
              person.siblingOrder ?? inferred.siblingOrder;
            person.rank = person.rank || inferred.rank;
          }
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    // 导入抢锁时子代/父节点回填失败不阻断详情
  }

  try {
    const [withCourtesy] = await attachCourtesy([person]);
    person = withCourtesy;
  } catch {
    // courtesy 表未就绪时忽略
  }
  try {
    const [withReview] = await attachLatestReviewStatus([person]);
    return withReview;
  } catch {
    return person;
  }
}

export async function getChildren(parentId: number) {
  const hasRelation = await tableExists("tb_people_relation");

  // 列表展开只需轻量字段，避免 JOIN info / 相关子查询拖慢
  const liteSelect = `p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT,
            p.F_CREATE_TIME, p.F_CREATE_ADMIN, p.F_EDIT_TIME,
            NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
            NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION, NULL AS F_PROFESSIONAL_TITLE,
            NULL AS F_COLLEGE, NULL AS F_DEGREE,
            CASE WHEN (p.F_RIGHT - p.F_LEFT) > 1 THEN 1 ELSE 0 END AS child_count`;

  await ensureSiblingOrderTable();

  // 先按父节点索引取子 ID，再 IN 查人；禁止对 tb_people 做 OR 条件全表扫
  const childIdSet = new Set<number>();
  if (hasRelation) {
    const relIds = await query<RowDataPacket[]>(
      `SELECT F_PEOPLE_ID AS id FROM tb_people_relation
       WHERE F_PARENT_ID = :parentId`,
      { parentId },
    );
    for (const r of relIds) childIdSet.add(Number(r.id));
  }
  const soIds = await query<RowDataPacket[]>(
    `SELECT people_id AS id FROM app_sibling_order
     WHERE parent_id = :parentId`,
    { parentId },
  );
  for (const r of soIds) childIdSet.add(Number(r.id));

  // 无 relation 表时才用 nested-set 补子代 ID
  if (!hasRelation && childIdSet.size === 0) {
    await ensurePeopleIndexes();
    const parents = await query<
      (RowDataPacket & {
        F_LEFT: number;
        F_RIGHT: number;
        F_LEVEL: number;
        F_FLAG: number | null;
      })[]
    >(
      `SELECT F_LEFT, F_RIGHT, F_LEVEL, F_FLAG
       FROM tb_people WHERE F_ID = :parentId LIMIT 1`,
      { parentId },
    );
    const parent = parents[0];
    if (!parent) return [];
    const flag = Number(parent.F_FLAG || 0);
    const nestIds = await query<RowDataPacket[]>(
      `SELECT p.F_ID AS id
       FROM tb_people p
       WHERE p.F_LEFT > :left AND p.F_RIGHT < :right
         AND p.F_LEVEL = :childLevel
         AND (:flag = 0 OR p.F_FLAG = :flag)
       ORDER BY p.F_LEFT ASC`,
      {
        left: Number(parent.F_LEFT),
        right: Number(parent.F_RIGHT),
        childLevel: Number(parent.F_LEVEL) + 1,
        flag,
      },
    );
    for (const r of nestIds) childIdSet.add(Number(r.id));
  }

  if (childIdSet.size === 0) return [];

  const childIds = [...childIdSet];
  const placeholders = childIds.map(() => "?").join(",");
  const rows = await query<PeopleDb[]>(
    `SELECT ${liteSelect},
            r.F_PARENT_ID, r.F_PARENT_NAME, r.F_FATHER_ID
     FROM tb_people p
     LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID
     WHERE p.F_ID IN (${placeholders})
     ORDER BY
       (CASE WHEN IFNULL(p.F_CREATE_ADMIN,'') = 'platform' THEN 0 ELSE 1 END),
       p.F_LEFT ASC, p.F_NO ASC, p.F_ID ASC`,
    childIds,
  );

  const parents = await query<RowDataPacket[]>(
    `SELECT F_NAME FROM tb_people WHERE F_ID = :parentId LIMIT 1`,
    { parentId },
  );
  const parentName = parents[0] ? String(parents[0].F_NAME || "") : "";
  const mapped = rows.map((r) => {
    const m = mapRow(r);
    if (!m.parentId) {
      m.parentId = parentId;
      m.parentName = parentName || m.parentName;
    }
    return m;
  });
  const attached = await attachSiblingMeta(mapped);
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
    await upsertPeopleRelationParent(conn, {
      peopleId: childId,
      parentId: id,
      parentName: payload.name,
      parentNo: payload.no || "",
    });
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

  const createTime = resolveCreateTime(payload);
  const [ins] = await conn.execute<ResultSetHeader>(
    `INSERT INTO tb_people
      (F_ADDRESS, F_ALIAS, F_BIRTHDAY, F_CHECK_ADMIN, F_CHECK_TIME, F_CREATE_ADMIN, F_CREATE_TIME,
       F_DEATHDAY, F_EDIT_ADMIN, F_EDIT_TIME, F_FLAG, F_GROUP, F_IS_HEIR, F_LEFT, F_LEVEL, F_NAME,
       F_NO, F_RIGHT, F_SEX, F_LNG_LAT, F_ORIGINAL_DATA, F_PINYIN)
     VALUES (?, ?, ?, '', '', 'platform', ?,
             ?, '', '', ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?)`,
    [
      payload.address || "",
      legacyAlias,
      payload.birthday || "",
      createTime,
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

  if (opts.parentId && (await tableExists("tb_people_relation"))) {
    await upsertPeopleRelationParent(conn, {
      peopleId: id,
      parentId: opts.parentId,
      parentName: opts.parentName,
      parentNo: opts.parentNo,
      birthFatherId: payload.birthFatherId || 0,
      pinyin: payload.pinyin || "",
    });
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
  const createTime = normalizeCreateTime(payload.createTime);
  await conn.execute(
    `UPDATE tb_people SET
      F_NAME = ?, F_SEX = ?, F_NO = ?, F_LEVEL = ?, F_GROUP = ?,
      F_BIRTHDAY = ?, F_DEATHDAY = ?, F_ADDRESS = ?, F_PINYIN = ?, F_ALIAS = ?,
      F_IS_HEIR = ?, F_ORIGINAL_DATA = ?, F_LNG_LAT = ?,
      F_CREATE_TIME = CASE WHEN ? <> '' THEN ? ELSE F_CREATE_TIME END,
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
      createTime,
      createTime,
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
  // 同步父子关系到 relation（缺行则插入；改父也要写 F_PARENT_*）
  let pid = payload.parentId ? Number(payload.parentId) : null;
  if (!pid && (await tableExists("tb_people_relation"))) {
    const [rels] = await conn.query<RowDataPacket[]>(
      `SELECT F_PARENT_ID FROM tb_people_relation WHERE F_PEOPLE_ID = ? LIMIT 1`,
      [id],
    );
    pid = Number(rels[0]?.F_PARENT_ID || 0) || null;
  }
  if (!pid) {
    await ensureSiblingOrderTable();
    const [so] = await conn.query<RowDataPacket[]>(
      `SELECT parent_id FROM app_sibling_order WHERE people_id = ? LIMIT 1`,
      [id],
    );
    pid = Number(so[0]?.parent_id || 0) || null;
  }

  if (pid && (await tableExists("tb_people_relation"))) {
    await upsertPeopleRelationParent(conn, {
      peopleId: id,
      parentId: pid,
      birthFatherId: payload.birthFatherId || 0,
      pinyin: payload.pinyin || "",
    });
  } else if (await tableExists("tb_people_relation")) {
    await conn.execute(
      `UPDATE tb_people_relation
       SET F_PINYIN = ?, F_FATHER_ID = ?
       WHERE F_PEOPLE_ID = ?`,
      [payload.pinyin || "", payload.birthFatherId || 0, id],
    );
  }

  if (pid && (payload.rank || payload.siblingOrder != null || payload.parentId)) {
    await upsertPersonSiblingMeta(conn, id, pid, payload);
    if (await tableExists("tb_people_relation")) {
      await refreshParentChildren(conn, pid);
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

/** 写入/补齐父子关系到 tb_people_relation（父亲检索依赖此表） */
async function upsertPeopleRelationParent(
  conn: PoolConnection,
  opts: {
    peopleId: number;
    parentId: number;
    parentName?: string;
    parentNo?: string;
    birthFatherId?: number;
    pinyin?: string;
  },
) {
  if (!(await tableExists("tb_people_relation"))) return;
  let parentName = opts.parentName || "";
  let parentNo = opts.parentNo || "";
  if (!parentName) {
    const [parents] = await conn.query<
      (RowDataPacket & { F_NAME: string; F_NO: string | null })[]
    >(`SELECT F_NAME, F_NO FROM tb_people WHERE F_ID = ? LIMIT 1`, [
      opts.parentId,
    ]);
    parentName = parents[0]?.F_NAME || "";
    parentNo = parents[0]?.F_NO || "";
  }
  await conn.execute(
    `INSERT INTO tb_people_relation
      (F_PEOPLE_ID, F_FATHER, F_PARENT_ID, F_PARENT_NAME, F_PARENT_NO, F_FATHER_ID, F_FATHER_NO, F_PINYIN)
     VALUES (?, '', ?, ?, ?, ?, '', ?)
     ON DUPLICATE KEY UPDATE
       F_PARENT_ID = VALUES(F_PARENT_ID),
       F_PARENT_NAME = VALUES(F_PARENT_NAME),
       F_PARENT_NO = VALUES(F_PARENT_NO),
       F_FATHER_ID = VALUES(F_FATHER_ID),
       F_PINYIN = VALUES(F_PINYIN)`,
    [
      opts.peopleId,
      opts.parentId,
      parentName.slice(0, 10),
      parentNo.slice(0, 10),
      opts.birthFatherId || 0,
      (opts.pinyin || "").slice(0, 50),
    ],
  );
}

let relationRepairAt = 0;

/** 补齐：有排行父、但缺 relation 的成员（进程内最多约每小时一次） */
export async function repairMissingParentRelations(force = false) {
  if (!(await tableExists("tb_people_relation"))) return { fixed: 0 };
  if (!force && Date.now() - relationRepairAt < 60 * 60 * 1000) {
    return { fixed: 0, skipped: true as const };
  }
  relationRepairAt = Date.now();
  await ensureSiblingOrderTable();
  // F_PARENT_NAME/NO 仅 varchar(10)/pinyin(50)，需截断以免整批插入失败
  const result = await execute(
    `INSERT INTO tb_people_relation
      (F_PEOPLE_ID, F_FATHER, F_PARENT_ID, F_PARENT_NAME, F_PARENT_NO, F_FATHER_ID, F_FATHER_NO, F_PINYIN)
     SELECT s.people_id, '', s.parent_id,
            LEFT(IFNULL(pp.F_NAME, ''), 10), LEFT(IFNULL(pp.F_NO, ''), 10),
            0, '', LEFT(IFNULL(p.F_PINYIN, ''), 50)
     FROM app_sibling_order s
     JOIN tb_people p ON p.F_ID = s.people_id
     LEFT JOIN tb_people pp ON pp.F_ID = s.parent_id
     LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = s.people_id
     WHERE s.parent_id > 0
       AND r.F_PEOPLE_ID IS NULL`,
  );
  return { fixed: Number(result.affectedRows || 0) };
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
    daikaoTotal: number;
    daikaoFile1: number;
    daikaoFile2: number;
    daikaoMale: number;
    daikaoFemale: number;
    daikaoRoots: number;
    daikaoErrors: number;
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
  let daikaoTotal = 0;
  let daikaoFile1 = 0;
  let daikaoFile2 = 0;
  let daikaoMale = 0;
  let daikaoFemale = 0;
  let daikaoRoots = 0;
  let daikaoErrors = 0;

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
  if (await tableExists("tb_daikao_people")) {
    const rows = await query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(source_file = '待攷支一') AS file1,
         SUM(source_file = '待攷支二') AS file2,
         SUM(sex = '男') AS male_cnt,
         SUM(sex = '女') AS female_cnt,
         SUM(is_root = 1) AS roots
       FROM tb_daikao_people`,
    );
    const r = rows[0];
    daikaoTotal = Number(r?.total || 0);
    daikaoFile1 = Number(r?.file1 || 0);
    daikaoFile2 = Number(r?.file2 || 0);
    daikaoMale = Number(r?.male_cnt || 0);
    daikaoFemale = Number(r?.female_cnt || 0);
    daikaoRoots = Number(r?.roots || 0);
  }
  if (await tableExists("tb_daikao_parse_error")) {
    const errRows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM tb_daikao_parse_error`,
    );
    daikaoErrors = Number(errRows[0]?.c || 0);
  }

  const statusRows = await query<RowDataPacket[]>(
    `SELECT status, COUNT(*) AS c FROM app_change_requests GROUP BY status`,
  );
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[String(r.status)] = Number(r.c);
  const data = {
    peopleTotal,
    branchTotal,
    daikaoTotal,
    daikaoFile1,
    daikaoFile2,
    daikaoMale,
    daikaoFemale,
    daikaoRoots,
    daikaoErrors,
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

/** 将待审父节点插到目标子节点上方（子可为已入库或待审负 ID） */
function walkInjectAsParent(
  node: LineageNode,
  childId: number,
  parent: LineageNode,
): boolean {
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].id === childId) {
      parent.children = [node.children[i], ...parent.children];
      node.children[i] = parent;
      return true;
    }
    if (walkInjectAsParent(node.children[i], childId, parent)) return true;
  }
  return false;
}

function mapPendingCreateRow(r: RowDataPacket): PendingCreate {
  const payload =
    typeof r.payload === "string"
      ? (JSON.parse(r.payload) as PeoplePayload)
      : (r.payload as PeoplePayload);
  const parentId =
    payload.parentId != null && Number(payload.parentId) !== 0
      ? Number(payload.parentId)
      : null;
  const asParentOf =
    payload.asParentOf != null && Number(payload.asParentOf) !== 0
      ? Number(payload.asParentOf)
      : null;
  return {
    requestId: Number(r.id),
    name: String(payload.name || ""),
    sex: payload.sex === "女" ? "女" : "男",
    level: payload.level ?? null,
    rank: payload.rank || null,
    parentId,
    asParentOf,
  };
}

/**
 * 加载挂在已入库人物上的待审新增，并继续拉取挂在待审节点上的链式新增
 *（parentId / asParentOf 可为负：-requestId）。
 */
async function loadPendingCreates(
  relatedIds: number[],
): Promise<PendingCreate[]> {
  if (!relatedIds.length) return [];
  const found = new Map<number, PendingCreate>();
  let anchors = [...relatedIds];

  for (let round = 0; round < 6 && anchors.length; round++) {
    const placeholders = anchors.map((_, i) => `:a${round}_${i}`).join(",");
    const params: Record<string, unknown> = {};
    anchors.forEach((v, i) => {
      params[`a${round}_${i}`] = v;
    });
    const exclude = [...found.keys()];
    const excludeSql = exclude.length
      ? `AND id NOT IN (${exclude.map((_, i) => `:ex${round}_${i}`).join(",")})`
      : "";
    exclude.forEach((v, i) => {
      params[`ex${round}_${i}`] = v;
    });

    const rows = await query<RowDataPacket[]>(
      `SELECT id, payload
       FROM app_change_requests
       WHERE operation = 'create'
         AND status IN ('draft', 'pending_1', 'pending_2', 'pending_final')
         AND (
           CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.parentId')) AS SIGNED) IN (${placeholders})
           OR CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.asParentOf')) AS SIGNED) IN (${placeholders})
         )
         ${excludeSql}
       ORDER BY id ASC`,
      params,
    );
    const nextAnchors: number[] = [];
    for (const r of rows) {
      const pc = mapPendingCreateRow(r);
      if (found.has(pc.requestId)) continue;
      found.set(pc.requestId, pc);
      // 下一轮以待审节点负 ID 为锚，拉取再下一层
      nextAnchors.push(-pc.requestId);
    }
    anchors = nextAnchors;
  }

  return [...found.values()];
}

type FlatNode = PeopleRow & { left: number; right: number };

/** nested-set 区间超过此值则改走关系表 BFS（策略切换，非结果截断） */
const LINEAGE_NESTED_SPAN_MAX = 800;

function buildTreeFromFlat(
  rootId: number,
  flat: FlatNode[],
  maxDepth: number,
): LineageNode {
  const sorted = [...flat].sort((a, b) => a.left - b.left);
  const nodes = new Map<number, LineageNode>();
  const childrenOf = new Map<number, number[]>();
  const byId = new Map<number, FlatNode>();
  const stack: FlatNode[] = [];

  for (const item of sorted) {
    nodes.set(item.id, toLineageNode(item));
    byId.set(item.id, item);
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

  function attach(nid: number, depth: number): LineageNode {
    const node = nodes.get(nid) || {
      id: nid,
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
    const kidIds = childrenOf.get(nid) || [];
    const kidRows = kidIds
      .map((cid) => byId.get(cid))
      .filter(Boolean) as FlatNode[];
    const ordered = sortByBirthOrder(kidRows);
    node.children = ordered.map((k, idx) => {
      const child = attach(k.id, depth + 1);
      child.rank = k.rank || rankLabelTraditional(k.sex, idx);
      return child;
    });
    return node;
  }

  return attach(rootId, 0);
}

function collectLineageIds(node: LineageNode, into: Set<number>) {
  if (node.id > 0) into.add(node.id);
  for (const c of node.children) collectLineageIds(c, into);
}

function findLineageNode(
  node: LineageNode,
  id: number,
): LineageNode | null {
  if (node.id === id) return node;
  for (const c of node.children) {
    const hit = findLineageNode(c, id);
    if (hit) return hit;
  }
  return null;
}

/** 轻量世系字段（不联 info，避免宽表扫描） */
const LINEAGE_LITE_SELECT = `p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
            p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
            p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
            NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME,
            NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION,
            NULL AS F_PROFESSIONAL_TITLE, NULL AS F_COLLEGE, NULL AS F_DEGREE,
            0 AS child_count`;

/** 批量按父节点取子代（relation + sibling_order），不截断子代数 */
async function batchChildrenByParents(
  parentIds: number[],
  maxLevel: number,
): Promise<Map<number, PeopleRow[]>> {
  const map = new Map<number, PeopleRow[]>();
  const ids = [...new Set(parentIds.filter((x) => x > 0))];
  if (!ids.length) return map;
  for (const id of ids) map.set(id, []);

  const hasRelation = await tableExists("tb_people_relation");
  await ensureSiblingOrderTable();
  const ph = ids.map((_, i) => `:p${i}`).join(",");
  const params: Record<string, unknown> = { maxLevel };
  ids.forEach((id, i) => {
    params[`p${i}`] = id;
  });

  if (hasRelation) {
    const rows = await query<PeopleDb[]>(
      `SELECT ${LINEAGE_LITE_SELECT},
              r.F_PARENT_ID, r.F_PARENT_NAME, r.F_FATHER_ID
       FROM tb_people_relation r
       JOIN tb_people p ON p.F_ID = r.F_PEOPLE_ID
       WHERE r.F_PARENT_ID IN (${ph})
         AND (p.F_LEVEL IS NULL OR p.F_LEVEL <= :maxLevel)
       ORDER BY r.F_PARENT_ID ASC, p.F_LEFT ASC, p.F_ID ASC`,
      params,
    );
    for (const r of rows) {
      const pid = Number(r.F_PARENT_ID);
      const arr = map.get(pid);
      if (!arr) continue;
      arr.push(mapRow(r));
    }
  }

  const soRows = await query<PeopleDb[]>(
    `SELECT ${LINEAGE_LITE_SELECT},
            s.parent_id AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID
     FROM app_sibling_order s
     JOIN tb_people p ON p.F_ID = s.people_id
     WHERE s.parent_id IN (${ph})
       AND (p.F_LEVEL IS NULL OR p.F_LEVEL <= :maxLevel)
     ORDER BY s.parent_id ASC, s.sort_no ASC, p.F_ID ASC`,
    params,
  );
  for (const r of soRows) {
    const pid = Number(r.F_PARENT_ID);
    const arr = map.get(pid);
    if (!arr) continue;
    const kid = mapRow(r);
    if (arr.some((x) => x.id === kid.id)) continue;
    arr.push(kid);
  }

  for (const [pid, arr] of map) {
    if (!arr.length) continue;
    const attached = await attachSiblingMeta(arr);
    map.set(pid, annotateRanks(sortByBirthOrder(attached)));
  }
  return map;
}

/**
 * 按关系表 BFS 建宽谱：每层一次批量查询，按代数上限展开全部子代。
 */
async function buildWideTreeBatched(
  root: PeopleRow,
  maxLevel: number,
  relatedIds: Set<number>,
): Promise<LineageNode> {
  const rootNode = toLineageNode(root);
  relatedIds.add(root.id);
  const nodeMap = new Map<number, LineageNode>([[root.id, rootNode]]);
  let frontier = [root.id];

  while (frontier.length) {
    const parents = frontier.filter((id) => {
      const n = nodeMap.get(id);
      return n && Number(n.level ?? 0) < maxLevel;
    });
    frontier = [];
    if (!parents.length) break;

    const kidsMap = await batchChildrenByParents(parents, maxLevel);
    for (const pid of parents) {
      const parentNode = nodeMap.get(pid);
      if (!parentNode) continue;
      const kids = kidsMap.get(pid) || [];
      parentNode.children = [];
      for (let idx = 0; idx < kids.length; idx++) {
        const k = kids[idx];
        if (Number(k.level ?? 0) > maxLevel) continue;
        relatedIds.add(k.id);
        let child = nodeMap.get(k.id);
        if (!child) {
          child = toLineageNode(k);
          nodeMap.set(k.id, child);
          if (Number(k.level ?? 0) < maxLevel) frontier.push(k.id);
        }
        child.rank = k.rank || rankLabelTraditional(k.sex, idx);
        parentNode.children.push(child);
      }
    }
  }
  return rootNode;
}

/**
 * 对已入树的全部节点按关系表补全子代（含旁系上的平台新录）。
 * nested-set 常漏掉 left/right 占位的新成员；原先只补直系路径，
 * 导致以旁系祖先为中心查询时，堂兄弟支下的昭/宪/庆等不显示。
 */
async function expandLineageTreeChildren(
  tree: LineageNode,
  relatedIds: Set<number>,
  maxLevel: number,
): Promise<void> {
  const collectEligible = (n: LineageNode, into: number[]) => {
    if (n.id > 0 && Number(n.level ?? 0) < maxLevel) into.push(n.id);
    for (const c of n.children) collectEligible(c, into);
  };

  let frontier: number[] = [];
  collectEligible(tree, frontier);
  const fetched = new Set<number>();
  const CHUNK = 30;

  while (frontier.length) {
    const parents = [...new Set(frontier)].filter((id) => !fetched.has(id));
    frontier = [];
    if (!parents.length) break;

    const kidsMap = new Map<number, PeopleRow[]>();
    for (let i = 0; i < parents.length; i += CHUNK) {
      const chunk = parents.slice(i, i + CHUNK);
      const part = await batchChildrenByParents(chunk, maxLevel);
      for (const [k, v] of part) kidsMap.set(k, v);
      for (const id of chunk) fetched.add(id);
    }

    for (const pid of parents) {
      const parentNode = findLineageNode(tree, pid);
      if (!parentNode) continue;
      const kids = kidsMap.get(pid) || [];
      if (!kids.length) continue;

      const byId = new Map(parentNode.children.map((c) => [c.id, c]));
      const next: LineageNode[] = [];
      const seen = new Set<number>();
      for (let idx = 0; idx < kids.length; idx++) {
        const k = kids[idx];
        if (Number(k.level ?? 0) > maxLevel) continue;
        let child = byId.get(k.id);
        if (!child) {
          child = toLineageNode(k);
          relatedIds.add(k.id);
        }
        child.rank = k.rank || rankLabelTraditional(k.sex, idx);
        next.push(child);
        seen.add(k.id);
        if (Number(k.level ?? 0) < maxLevel && !fetched.has(k.id)) {
          frontier.push(k.id);
        }
      }
      for (const c of parentNode.children) {
        if (seen.has(c.id)) continue;
        next.push(c);
        if (c.id > 0 && Number(c.level ?? 0) < maxLevel && !fetched.has(c.id)) {
          frontier.push(c.id);
        }
      }
      parentNode.children = next;
    }
  }
}

/** nested-set 轻量拉取：无 info 联表；区间过大则跳过 */
async function fetchLineageFlatLite(
  rootId: number,
  maxLevel: number,
): Promise<{
  bounds: { l: number; r: number; lv: number; flag: number } | null;
  flat: FlatNode[];
}> {
  const boundsRows = await query<RowDataPacket[]>(
    `SELECT F_LEFT AS l, F_RIGHT AS r, F_LEVEL AS lv, F_FLAG AS flag
     FROM tb_people WHERE F_ID = :id LIMIT 1`,
    { id: rootId },
  );
  const b = boundsRows[0];
  if (!b) return { bounds: null, flat: [] };

  const bounds = {
    l: Number(b.l),
    r: Number(b.r),
    lv: Number(b.lv || 0),
    flag: Number(b.flag || 0),
  };
  const span = bounds.r - bounds.l;
  // 占位区间或整支过大：改走关系表 BFS
  if (span <= 1 || span > LINEAGE_NESTED_SPAN_MAX) {
    return { bounds, flat: [] };
  }

  const hasRelation = await tableExists("tb_people_relation");
  const rows = await query<(PeopleDb & { _left: number; _right: number })[]>(
    `SELECT ${LINEAGE_LITE_SELECT},
            p.F_LEFT AS _left, p.F_RIGHT AS _right,
            ${hasRelation ? "r.F_PARENT_ID, r.F_PARENT_NAME, r.F_FATHER_ID" : "NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID"}
     FROM tb_people p
     ${hasRelation ? "LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID" : ""}
     WHERE p.F_FLAG = :flag
       AND p.F_LEFT >= :l AND p.F_RIGHT <= :r
       AND p.F_LEVEL <= :maxLevel
     ORDER BY p.F_LEFT ASC`,
    { l: bounds.l, r: bounds.r, maxLevel, flag: bounds.flag },
  );
  const mapped: FlatNode[] = rows.map((r) => ({
    ...mapRow(r),
    left: Number(r._left),
    right: Number(r._right),
  }));
  try {
    const attached = await attachSiblingMeta(mapped);
    return {
      bounds,
      flat: attached.map((p, i) => ({
        ...p,
        left: mapped[i].left,
        right: mapped[i].right,
      })),
    };
  } catch {
    // app_sibling_order 未就绪时忽略
  }
  return { bounds, flat: mapped };
}

/**
 * 宽谱世系：以上溯最远祖先为根，展开各代同父兄弟及其子嗣，
 * 下延至「中心人物世代 + down」。按层批量查，有节点预算。
 */
export async function getLineageTree(
  id: number,
  opts?: { up?: number; down?: number },
) {
  const up = Math.min(10, Math.max(0, opts?.up ?? 1));
  const down = Math.min(10, Math.max(0, opts?.down ?? 1));

  const focus = await getPeopleById(id);
  if (!focus) return null;

  const ancestors =
    up > 0 ? await getAncestors(id, up) : ([] as PeopleRow[]);
  const rootPerson = ancestors[0] ?? focus;
  const focusLevel = Number(focus.level ?? 0);
  const maxLevel = focusLevel + down;
  const rootLevel = Number(rootPerson.level ?? focusLevel);
  const depthSpan = Math.max(0, maxLevel - rootLevel);

  const relatedIds = new Set<number>([
    focus.id,
    rootPerson.id,
    ...ancestors.map((a) => a.id),
  ]);

  let tree: LineageNode = toLineageNode(rootPerson);

  const needTree = ancestors.length > 0 || down > 0;
  if (needTree) {
    const { flat } = await fetchLineageFlatLite(rootPerson.id, maxLevel);
    const flatOk =
      flat.length > 0 &&
      flat.some((f) => f.id === rootPerson.id) &&
      (rootPerson.id === focus.id || flat.some((f) => f.id === focus.id));

    if (flatOk) {
      for (const f of flat) relatedIds.add(f.id);
      tree = buildTreeFromFlat(rootPerson.id, flat, depthSpan);
    } else {
      // nested-set 不可用 / 未覆盖中心人（常见于平台新录）：关系表分层 BFS
      tree = await buildWideTreeBatched(rootPerson, maxLevel, relatedIds);
    }

    // nested-set 漏挂平台新录；直系补丁也不够——对图上所有节点按关系表向下补全
    await expandLineageTreeChildren(tree, relatedIds, maxLevel);
  }

  collectLineageIds(tree, relatedIds);

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
      // 先挂子代，再把「待审父」插到目标子上方，以便链式待审能叠起来
      const asParents = pendingCreates.filter((pc) => pc.asParentOf);
      const asChildren = pendingCreates.filter((pc) => !pc.asParentOf);

      for (const pc of asChildren) {
        const node = pendingToNode(pc);
        if (pc.parentId != null && walkInjectChild(tree, pc.parentId, node)) {
          continue;
        }
        if (
          pc.parentId != null &&
          focus.parentId != null &&
          pc.parentId === focus.parentId
        ) {
          pendingSiblings.push(node);
        }
      }

      for (const pc of asParents) {
        const node = pendingToNode(pc);
        const target = pc.asParentOf!;
        // 挂已入库成员：仍用顶部「待审父辈」条，保持原交互
        if (target > 0) {
          pendingParents.push({ asParentOf: target, node });
          continue;
        }
        // 挂另一待审节点：插到树内或旁挂兄弟上
        if (walkInjectAsParent(tree, target, node)) continue;
        const sibIdx = pendingSiblings.findIndex((s) => s.id === target);
        if (sibIdx >= 0) {
          node.children = [pendingSiblings[sibIdx], ...node.children];
          pendingSiblings[sibIdx] = node;
          continue;
        }
        pendingParents.push({ asParentOf: target, node });
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

function groupByGeneration(people: PeopleRow[]) {
  const gens = new Map<number, PeopleRow[]>();
  for (const p of people) {
    const lv = p.level ?? 0;
    if (!gens.has(lv)) gens.set(lv, []);
    gens.get(lv)!.push(p);
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
     ORDER BY p.F_LEVEL ASC, p.F_NO ASC, p.F_ID ASC`,
    { id, minLevel, maxLevel },
  );

  if (rows.length < 2) {
    const people = [...ancestors, focus, ...(await getChildren(focus.id))];
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
  const up = Math.min(20, Math.max(0, opts?.up ?? 1));
  const down = Math.min(20, Math.max(0, opts?.down ?? 1));
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
