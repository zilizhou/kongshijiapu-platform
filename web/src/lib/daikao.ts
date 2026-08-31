import { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { AuthError } from "./auth";
import { execute, query } from "./db";
import { normalizeIdCard, normalizeIdCardForStore } from "./id-card";
import { normalizePhoneForStore } from "./phone";
import { searchPeople, loadAncestralHomeFromRequest } from "./people";
import { nameToPinyin } from "./pinyin";
import {
  DaikaoAdmitStatus,
  DaikaoRow,
  DaikaoUpdatePayload,
  PeoplePayload,
  PeopleRow,
  Role,
  SessionUser,
} from "./types";
import {
  parseRankToIndex,
  rankLabelTraditional,
  searchTextVariants,
} from "./zh";

const tableExistsCache = new Map<string, boolean>();
let admitColumnsReady = false;
let extraColumnsReady = false;
let siblingTableReady = false;

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

async function columnExists(table: string, column: string) {
  const rows = await query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = :table
       AND column_name = :column
     LIMIT 1`,
    { table, column },
  );
  return rows.length > 0;
}

/** 确保入谱状态列存在（可重复调用） */
export async function ensureDaikaoAdmitColumns() {
  if (admitColumnsReady) return;
  if (!(await tableExists("tb_daikao_people"))) return;
  if (!(await columnExists("tb_daikao_people", "admit_status"))) {
    await execute(
      `ALTER TABLE tb_daikao_people
         ADD COLUMN admit_status VARCHAR(20) NOT NULL DEFAULT 'none'
           COMMENT 'none|pending|admitted' AFTER created_at,
         ADD COLUMN admit_request_id BIGINT NULL
           COMMENT '进行中的入谱变更单' AFTER admit_status,
         ADD COLUMN admitted_people_id INT NULL
           COMMENT '正式库成员 ID' AFTER admit_request_id,
         ADD COLUMN admitted_at DATETIME NULL AFTER admitted_people_id`,
    );
  }
  try {
    await execute(
      `CREATE INDEX idx_daikao_admit_status ON tb_daikao_people (admit_status)`,
    );
  } catch {
    /* index may exist */
  }
  admitColumnsReady = true;
}

const EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  { name: "pinyin", ddl: "ADD COLUMN pinyin VARCHAR(80) NULL" },
  { name: "alias", ddl: "ADD COLUMN alias VARCHAR(80) NULL" },
  { name: "zi", ddl: "ADD COLUMN zi VARCHAR(40) NULL" },
  { name: "hao", ddl: "ADD COLUMN hao VARCHAR(40) NULL" },
  { name: "birthday", ddl: "ADD COLUMN birthday VARCHAR(40) NULL" },
  { name: "deathday", ddl: "ADD COLUMN deathday VARCHAR(40) NULL" },
  { name: "phone", ddl: "ADD COLUMN phone VARCHAR(60) NULL" },
  { name: "id_card", ddl: "ADD COLUMN id_card VARCHAR(18) NULL" },
  { name: "nation", ddl: "ADD COLUMN nation VARCHAR(20) NULL" },
  { name: "ancestral_home", ddl: "ADD COLUMN ancestral_home VARCHAR(255) NULL" },
  { name: "lng_lat", ddl: "ADD COLUMN lng_lat VARCHAR(80) NULL" },
  { name: "spouse_info", ddl: "ADD COLUMN spouse_info TEXT NULL" },
  { name: "company", ddl: "ADD COLUMN company VARCHAR(255) NULL" },
  { name: "position", ddl: "ADD COLUMN `position` VARCHAR(100) NULL" },
  { name: "professional_title", ddl: "ADD COLUMN professional_title VARCHAR(100) NULL" },
  { name: "college", ddl: "ADD COLUMN college VARCHAR(255) NULL" },
  { name: "degree", ddl: "ADD COLUMN degree VARCHAR(50) NULL" },
  { name: "birth_father_id", ddl: "ADD COLUMN birth_father_id BIGINT NULL" },
  { name: "birth_mother", ddl: "ADD COLUMN birth_mother VARCHAR(40) NULL" },
  { name: "current_mother", ddl: "ADD COLUMN current_mother VARCHAR(40) NULL" },
  { name: "rank_label", ddl: "ADD COLUMN rank_label VARCHAR(20) NULL" },
];

export async function ensureDaikaoPeopleColumns() {
  await ensureDaikaoAdmitColumns();
  if (extraColumnsReady) return;
  if (!(await tableExists("tb_daikao_people"))) return;
  let allOk = true;
  for (const col of EXTRA_COLUMNS) {
    if (!(await columnExists("tb_daikao_people", col.name))) {
      try {
        await execute(`ALTER TABLE tb_daikao_people ${col.ddl}`);
      } catch {
        allOk = false;
      }
    }
  }
  if (await columnExists("tb_daikao_people", "id_card")) {
    try {
      await execute(
        `CREATE INDEX idx_daikao_id_card ON tb_daikao_people (id_card)`,
      );
    } catch {
      /* 索引可能已存在 */
    }
  }
  if (allOk) extraColumnsReady = true;
}

export async function ensureDaikaoSiblingOrderTable() {
  if (siblingTableReady) return;
  await execute(
    `CREATE TABLE IF NOT EXISTS app_daikao_sibling_order (
      people_id BIGINT NOT NULL PRIMARY KEY,
      parent_id BIGINT NOT NULL,
      sort_no INT NOT NULL DEFAULT 0,
      rank_label VARCHAR(20) NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_daikao_sib_parent_sort (parent_id, sort_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  siblingTableReady = true;
}

export async function ensureDaikaoSchema() {
  await ensureDaikaoPeopleColumns();
  await ensureDaikaoSiblingOrderTable();
}

export function canEditDaikao(role: Role) {
  return ["editor", "first", "second", "final", "admin"].includes(role);
}

export function assertCanEditDaikao(user: SessionUser) {
  if (!canEditDaikao(user.role)) {
    const err = new AuthError("当前角色不可编辑待考数据");
    err.status = 403;
    throw err;
  }
}

export function assertCanAdmitDaikao(user: SessionUser) {
  assertCanEditDaikao(user);
}

type DaikaoDb = RowDataPacket & {
  id: number;
  source_file: string;
  source_line: number;
  volume: string | null;
  section_path: string | null;
  is_root: number;
  is_out_heir: number;
  name: string;
  spectrum_no: string | null;
  generation: number | null;
  generation_label: string | null;
  group_raw: string | null;
  group1: string | null;
  group2: string | null;
  group3: string | null;
  children_sample: string | null;
  children_with_no: string | null;
  out_heirs: string | null;
  description: string | null;
  sex: string;
  spouse: string | null;
  address: string | null;
  parent_id: number | null;
  parent_name: string | null;
  parent_no: string | null;
  created_at: string | Date | null;
  admit_status?: string | null;
  admit_request_id?: number | null;
  admitted_people_id?: number | null;
  admitted_at?: string | Date | null;
  pinyin?: string | null;
  alias?: string | null;
  zi?: string | null;
  hao?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  phone?: string | null;
  id_card?: string | null;
  nation?: string | null;
  ancestral_home?: string | null;
  lng_lat?: string | null;
  spouse_info?: string | null;
  company?: string | null;
  position?: string | null;
  professional_title?: string | null;
  college?: string | null;
  degree?: string | null;
  birth_father_id?: number | null;
  birth_mother?: string | null;
  current_mother?: string | null;
  rank_label?: string | null;
  sibling_order?: number | null;
};

function mapAdmitStatus(v: string | null | undefined): DaikaoAdmitStatus {
  if (v === "pending" || v === "admitted") return v;
  return "none";
}

function mapRow(r: DaikaoDb): DaikaoRow {
  return {
    id: r.id,
    sourceFile: r.source_file,
    sourceLine: r.source_line,
    volume: r.volume,
    sectionPath: r.section_path,
    isRoot: Boolean(r.is_root),
    isOutHeir: Boolean(r.is_out_heir),
    name: r.name,
    spectrumNo: r.spectrum_no,
    generation: r.generation,
    generationLabel: r.generation_label,
    groupRaw: r.group_raw,
    group1: r.group1,
    group2: r.group2,
    group3: r.group3,
    childrenSample: r.children_sample,
    childrenWithNo: r.children_with_no,
    outHeirs: r.out_heirs,
    description: r.description,
    sex: r.sex || "男",
    spouse: r.spouse,
    address: r.address,
    parentId: r.parent_id,
    parentName: r.parent_name,
    parentNo: r.parent_no,
    createdAt: r.created_at ? String(r.created_at) : null,
    admitStatus: mapAdmitStatus(r.admit_status),
    admitRequestId:
      r.admit_request_id != null ? Number(r.admit_request_id) : null,
    admittedPeopleId:
      r.admitted_people_id != null ? Number(r.admitted_people_id) : null,
    admittedAt: r.admitted_at ? String(r.admitted_at) : null,
    pinyin: r.pinyin ?? null,
    alias: r.alias ?? null,
    zi: r.zi ?? null,
    hao: r.hao ?? null,
    birthday: r.birthday ?? null,
    deathday: r.deathday ?? null,
    phone: r.phone ?? null,
    idCard: r.id_card ?? null,
    nation: r.nation ?? null,
    ancestralHome: r.ancestral_home ?? null,
    lngLat: r.lng_lat ?? null,
    spouseInfo: r.spouse_info ?? null,
    company: r.company ?? null,
    position: r.position ?? null,
    professionalTitle: r.professional_title ?? null,
    college: r.college ?? null,
    degree: r.degree ?? null,
    birthFatherId:
      r.birth_father_id != null ? Number(r.birth_father_id) : null,
    birthMother: r.birth_mother ?? null,
    currentMother: r.current_mother ?? null,
    rank: r.rank_label ?? null,
    siblingOrder:
      r.sibling_order != null ? Number(r.sibling_order) : null,
  };
}

const SELECT_COLS = `d.id, d.source_file, d.source_line, d.volume, d.section_path,
  d.is_root, d.is_out_heir, d.name, d.spectrum_no, d.generation, d.generation_label,
  d.group_raw, d.group1, d.group2, d.group3, d.children_sample, d.children_with_no,
  d.out_heirs, d.description, d.sex, d.spouse, d.address, d.parent_id, d.parent_name,
  d.parent_no, d.created_at,
  d.admit_status, d.admit_request_id, d.admitted_people_id, d.admitted_at,
  d.pinyin, d.alias, d.zi, d.hao, d.birthday, d.deathday, d.phone, d.id_card, d.nation,
  d.ancestral_home, d.lng_lat, d.spouse_info, d.company, d.position,
  d.professional_title, d.college, d.degree, d.birth_father_id, d.birth_mother,
  d.current_mother, d.rank_label, s.sort_no AS sibling_order`;

export function daikaoToPeoplePayload(
  d: DaikaoRow,
  parentId?: number | null,
): PeoplePayload {
  const group =
    d.groupRaw ||
    [d.group1, d.group2, d.group3].filter(Boolean).join(",") ||
    "";
  const sex = d.sex === "女" ? "女" : "男";
  return {
    name: d.name,
    sex,
    no: d.spectrumNo || "",
    level: d.generation,
    group,
    birthday: d.birthday || "",
    deathday: d.deathday || "",
    address: d.address || "",
    pinyin: d.pinyin || nameToPinyin(d.name),
    alias: d.alias || "",
    zi: d.zi || "",
    hao: d.hao || "",
    nation: d.nation || "汉",
    isHeir: d.isOutHeir ? "1" : "0",
    originalData: "1",
    ancestralHome: d.ancestralHome || "",
    lngLat: d.lngLat || "",
    phone: d.phone || "",
    idCard: d.idCard || "",
    parentId: parentId !== undefined ? parentId : d.parentId,
    birthFatherId: d.birthFatherId ?? null,
    birthMother: d.birthMother || "",
    currentMother: d.currentMother || "",
    rank: d.rank || "",
    siblingOrder: d.siblingOrder ?? null,
    spouse: d.spouse || "",
    spouseInfo: d.spouseInfo || "",
    description: d.description || "",
    volume: d.volume || "",
    company: d.company || "",
    position: d.position || "",
    professionalTitle: d.professionalTitle || "",
    college: d.college || "",
    degree: d.degree || "",
    createTime: "",
    sourceDaikaoId: d.id,
  };
}

export function daikaoRowToPeopleRow(d: DaikaoRow): PeopleRow {
  return {
    id: d.id,
    name: d.name,
    sex: d.sex,
    no: d.spectrumNo,
    level: d.generation,
    groupName: d.groupRaw,
    birthday: d.birthday ?? null,
    deathday: d.deathday ?? null,
    address: d.address,
    pinyin: d.pinyin ?? null,
    alias: d.alias ?? null,
    zi: d.zi ?? null,
    hao: d.hao ?? null,
    isHeir: d.isOutHeir ? "1" : "0",
    originalData: "1",
    lngLat: d.lngLat ?? null,
    parentId: d.parentId,
    parentName: d.parentName,
    birthFatherId: d.birthFatherId ?? null,
    rank: d.rank ?? null,
    siblingOrder: d.siblingOrder ?? null,
    spouse: d.spouse,
    spouseInfo: d.spouseInfo ?? null,
    description: d.description,
    volume: d.volume,
    phone: d.phone ?? null,
    idCard: d.idCard ?? null,
    company: d.company ?? null,
    position: d.position ?? null,
    professionalTitle: d.professionalTitle ?? null,
    college: d.college ?? null,
    degree: d.degree ?? null,
    nation: d.nation ?? null,
    ancestralHome: d.ancestralHome ?? null,
    birthMother: d.birthMother ?? null,
    currentMother: d.currentMother ?? null,
    createTime: d.createdAt,
    createAdmin: d.sourceFile === "平台录入" ? "platform" : null,
    editTime: null,
    reviewStatus: d.reviewStatus ?? null,
    reviewRequestId: d.reviewRequestId ?? null,
  };
}

async function attachDaikaoReviewStatus(people: DaikaoRow[]): Promise<DaikaoRow[]> {
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
         WHERE object_type = 'daikao'
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

/** 入谱入口：待考已生效、未入谱、且无进行中的待考审核单 */
export function canAdmitDaikaoRow(d: DaikaoRow): boolean {
  if (d.admitStatus !== "none") return false;
  if (
    d.reviewStatus &&
    ["pending_1", "pending_2", "pending_final"].includes(d.reviewStatus)
  ) {
    return false;
  }
  return true;
}

export async function searchDaikao(opts: {
  name?: string;
  no?: string;
  level?: string;
  group?: string;
  sourceFile?: string;
  volume?: string;
  section?: string;
  admitStatus?: string;
  exactName?: boolean;
  parentId?: number;
  idCard?: string;
  page?: number;
  pageSize?: number;
}) {
  if (!(await tableExists("tb_daikao_people"))) {
    return { items: [] as DaikaoRow[], total: 0, page: 1, pageSize: 10 };
  }
  await ensureDaikaoSchema();

  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(5000, Math.max(1, opts.pageSize || 10));
  const where: string[] = ["1=1"];
  const params: Record<string, unknown> = {};

  if (opts.name?.trim()) {
    if (opts.exactName) {
      const variants = searchTextVariants(opts.name.trim());
      const parts = variants.map((v, i) => {
        params[`name${i}`] = v;
        return `d.name = :name${i}`;
      });
      where.push(`(${parts.join(" OR ")})`);
    } else {
      where.push("d.name LIKE :name");
      params.name = `%${opts.name.trim()}%`;
    }
  }
  if (opts.no?.trim()) {
    where.push("d.spectrum_no LIKE :no");
    params.no = `%${opts.no.trim()}%`;
  }
  if (opts.level?.trim()) {
    const n = Number(opts.level);
    if (!Number.isNaN(n)) {
      where.push("d.generation = :level");
      params.level = n;
    }
  }
  if (opts.group?.trim()) {
    where.push(
      "(d.group_raw LIKE :group OR d.group1 LIKE :group OR d.group2 LIKE :group OR d.group3 LIKE :group OR d.section_path LIKE :group)",
    );
    params.group = `%${opts.group.trim()}%`;
  }
  if (opts.sourceFile?.trim()) {
    where.push("d.source_file = :sourceFile");
    params.sourceFile = opts.sourceFile.trim();
  }
  if (opts.volume?.trim()) {
    where.push("d.volume LIKE :volume");
    params.volume = `%${opts.volume.trim()}%`;
  }
  if (opts.section?.trim()) {
    where.push("d.section_path LIKE :section");
    params.section = `%${opts.section.trim()}%`;
  }
  if (opts.admitStatus?.trim()) {
    where.push("d.admit_status = :admitStatus");
    params.admitStatus = opts.admitStatus.trim();
  }
  if (opts.parentId != null && Number(opts.parentId) > 0) {
    where.push("d.parent_id = :parentId");
    params.parentId = Number(opts.parentId);
  }
  const idCardQ = normalizeIdCard(opts.idCard);
  if (idCardQ) {
    if (idCardQ.length >= 15) {
      where.push("d.id_card = :idCard");
      params.idCard = idCardQ;
    } else {
      where.push("d.id_card LIKE :idCard");
      params.idCard = `%${idCardQ}%`;
    }
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM tb_daikao_people d WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.c || 0);
  const offset = (page - 1) * pageSize;
  params.limit = pageSize;
  params.offset = offset;

  const rows = await query<DaikaoDb[]>(
    `SELECT ${SELECT_COLS}
     FROM tb_daikao_people d
     LEFT JOIN app_daikao_sibling_order s ON s.people_id = d.id
     WHERE ${whereSql}
     ORDER BY d.source_file ASC, d.id ASC
     LIMIT :limit OFFSET :offset`,
    params,
  );

  const items = await attachDaikaoReviewStatus(rows.map(mapRow));
  return {
    items,
    total,
    page,
    pageSize,
  };
}

export async function getDaikaoById(id: number): Promise<DaikaoRow | null> {
  if (!(await tableExists("tb_daikao_people"))) return null;
  await ensureDaikaoSchema();
  const rows = await query<DaikaoDb[]>(
    `SELECT ${SELECT_COLS}
     FROM tb_daikao_people d
     LEFT JOIN app_daikao_sibling_order s ON s.people_id = d.id
     WHERE d.id = :id LIMIT 1`,
    { id },
  );
  if (!rows[0]) return null;
  const [mapped] = await attachDaikaoReviewStatus([mapRow(rows[0])]);
  if (!(mapped.ancestralHome || "").trim()) {
    mapped.ancestralHome = await loadAncestralHomeFromRequest("daikao", id);
  }
  return mapped;
}

function normStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export async function updateDaikao(
  id: number,
  payload: DaikaoUpdatePayload,
): Promise<DaikaoRow | null> {
  const existing = await getDaikaoById(id);
  if (!existing) return null;

  let group1 = payload.group1 !== undefined ? normStr(payload.group1) : existing.group1;
  let group2 = payload.group2 !== undefined ? normStr(payload.group2) : existing.group2;
  let group3 = payload.group3 !== undefined ? normStr(payload.group3) : existing.group3;
  let groupRaw =
    payload.groupRaw !== undefined ? normStr(payload.groupRaw) : existing.groupRaw;

  if (
    payload.group1 !== undefined ||
    payload.group2 !== undefined ||
    payload.group3 !== undefined
  ) {
    groupRaw = [group1, group2, group3].map((x) => x || "零").join(",");
  } else if (payload.groupRaw !== undefined && groupRaw) {
    const parts = groupRaw.split(/[,，]/).map((s) => s.trim());
    group1 = parts[0] || null;
    group2 = parts[1] || null;
    group3 = parts[2] || null;
  }

  const name =
    payload.name !== undefined ? String(payload.name || "").trim() : existing.name;
  if (!name) throw new Error("姓名不能为空");

  const sex =
    payload.sex !== undefined
      ? String(payload.sex || "男").trim() || "男"
      : existing.sex;

  let generation =
    payload.generation !== undefined
      ? payload.generation == null || payload.generation === ("" as unknown)
        ? null
        : Number(payload.generation)
      : existing.generation;
  if (generation != null && Number.isNaN(generation)) generation = existing.generation;

  const generationLabel =
    payload.generationLabel !== undefined
      ? normStr(payload.generationLabel)
      : existing.generationLabel;

  await execute(
    `UPDATE tb_daikao_people SET
      name = ?,
      spectrum_no = ?,
      generation = ?,
      generation_label = ?,
      group_raw = ?,
      group1 = ?,
      group2 = ?,
      group3 = ?,
      children_sample = ?,
      children_with_no = ?,
      out_heirs = ?,
      description = ?,
      sex = ?,
      spouse = ?,
      address = ?,
      volume = ?,
      section_path = ?,
      parent_name = ?,
      parent_no = ?,
      is_root = ?,
      is_out_heir = ?
     WHERE id = ?`,
    [
      name,
      payload.spectrumNo !== undefined
        ? normStr(payload.spectrumNo)
        : existing.spectrumNo,
      generation,
      generationLabel,
      groupRaw,
      group1,
      group2,
      group3,
      payload.childrenSample !== undefined
        ? normStr(payload.childrenSample)
        : existing.childrenSample,
      payload.childrenWithNo !== undefined
        ? normStr(payload.childrenWithNo)
        : existing.childrenWithNo,
      payload.outHeirs !== undefined ? normStr(payload.outHeirs) : existing.outHeirs,
      payload.description !== undefined
        ? payload.description == null
          ? null
          : String(payload.description)
        : existing.description,
      sex,
      payload.spouse !== undefined ? normStr(payload.spouse) : existing.spouse,
      payload.address !== undefined ? normStr(payload.address) : existing.address,
      payload.volume !== undefined ? normStr(payload.volume) : existing.volume,
      payload.sectionPath !== undefined
        ? normStr(payload.sectionPath)
        : existing.sectionPath,
      payload.parentName !== undefined
        ? normStr(payload.parentName)
        : existing.parentName,
      payload.parentNo !== undefined ? normStr(payload.parentNo) : existing.parentNo,
      payload.isRoot !== undefined ? (payload.isRoot ? 1 : 0) : existing.isRoot ? 1 : 0,
      payload.isOutHeir !== undefined
        ? payload.isOutHeir
          ? 1
          : 0
        : existing.isOutHeir
          ? 1
          : 0,
      id,
    ],
  );

  return getDaikaoById(id);
}

export async function getDaikaoChildren(parentId: number) {
  if (!(await tableExists("tb_daikao_people"))) return [] as DaikaoRow[];
  await ensureDaikaoSchema();
  const rows = await query<DaikaoDb[]>(
    `SELECT ${SELECT_COLS}
     FROM tb_daikao_people d
     LEFT JOIN app_daikao_sibling_order s ON s.people_id = d.id
     WHERE d.parent_id = :parentId
     ORDER BY IFNULL(s.sort_no, 9999) ASC, d.id ASC`,
    { parentId },
  );
  return attachDaikaoReviewStatus(rows.map(mapRow));
}

export type OfficialParentCandidate = {
  id: number;
  name: string;
  sex: string;
  level: number | null;
  groupName: string | null;
  parentName: string | null;
};

export type OfficialParentResolve = {
  parentId: number | null;
  parentMatch: "none" | "unique" | "ambiguous" | "female_only";
  parentName: string;
  parentCandidates: OfficialParentCandidate[];
};

/** 按姓名在正式库匹配当前父 */
export async function resolveOfficialParent(
  parentNameRaw: string | null | undefined,
): Promise<OfficialParentResolve> {
  const parentName = (parentNameRaw || "").trim();
  if (!parentName) {
    return {
      parentId: null,
      parentMatch: "none",
      parentName: "",
      parentCandidates: [],
    };
  }
  // 消歧需看全量同名，不能只取前 N 条
  const found = await searchPeople({
    name: parentName,
    exactName: true,
    page: 1,
    pageSize: 5000,
  });
  const variants = new Set(searchTextVariants(parentName));
  const exact = found.items.filter((x) => variants.has(x.name));
  const list = (exact.length ? exact : found.items).map((p) => ({
    id: p.id,
    name: p.name,
    sex: p.sex,
    level: p.level,
    groupName: p.groupName,
    parentName: p.parentName,
  }));
  if (exact.length === 1) {
    return {
      parentId: exact[0].id,
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
  if (list.length === 1) {
    return {
      parentId: list[0].id,
      parentMatch: "unique",
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

export type AdmitPreviewItem = {
  id: number;
  name: string;
  sex: string;
  level: number | null;
  group: string;
  ok: boolean;
  error?: string;
  parentName: string;
  parentMatch: "none" | "unique" | "ambiguous" | "female_only";
  parentId: number | null;
  parentCandidates: OfficialParentCandidate[];
};

/** 批量入谱预览（不建单） */
export async function previewDaikaoAdmit(
  ids: number[],
): Promise<AdmitPreviewItem[]> {
  const out: AdmitPreviewItem[] = [];
  for (const id of ids) {
    try {
      const row = await assertDaikaoAdmittable(id);
      const parent = await resolveOfficialParent(row.parentName);
      const group =
        row.groupRaw ||
        [row.group1, row.group2, row.group3].filter(Boolean).join(",") ||
        "";
      let ok = true;
      let error: string | undefined;
      if (!row.name?.trim()) {
        ok = false;
        error = "姓名为空";
      } else if (!group.trim()) {
        ok = false;
        error = "缺少所属派户支";
      } else if (parent.parentMatch === "ambiguous") {
        ok = false;
        error = `父亲「${parent.parentName}」重名，请选择`;
      } else if (parent.parentName && parent.parentMatch === "none") {
        // 有父名但未匹配：仍允许提交（父可空）
        error = `未匹配到正式库父亲「${parent.parentName}」，将按无父提交`;
      }
      out.push({
        id: row.id,
        name: row.name,
        sex: row.sex,
        level: row.generation,
        group,
        ok,
        error,
        parentName: parent.parentName,
        parentMatch: parent.parentMatch,
        parentId: parent.parentId,
        parentCandidates: parent.parentCandidates,
      });
    } catch (e) {
      out.push({
        id,
        name: "",
        sex: "",
        level: null,
        group: "",
        ok: false,
        error: e instanceof Error ? e.message : "不可入谱",
        parentName: "",
        parentMatch: "none",
        parentId: null,
        parentCandidates: [],
      });
    }
  }
  return out;
}

/** 校验是否可发起入谱；返回当前行 */
export async function assertDaikaoAdmittable(id: number): Promise<DaikaoRow> {
  await ensureDaikaoAdmitColumns();
  let row = await getDaikaoById(id);
  if (!row) throw new Error("待考成员不存在");
  if (row.admitStatus === "admitted") {
    throw new Error(
      `该成员已入谱${row.admittedPeopleId ? `（正式成员 #${row.admittedPeopleId}）` : ""}`,
    );
  }
  if (row.admitStatus === "pending" && row.admitRequestId) {
    // 关联变更单已驳回/暂存/删除时，清掉卡住的 pending，允许继续改后重提
    const reqRows = await query<RowDataPacket[]>(
      `SELECT id, status FROM app_change_requests WHERE id = :id LIMIT 1`,
      { id: row.admitRequestId },
    );
    const reqStatus = reqRows[0] ? String(reqRows[0].status || "") : "";
    const stale =
      !reqRows[0] ||
      reqStatus === "rejected" ||
      reqStatus === "draft" ||
      reqStatus === "approved";
    if (stale) {
      await clearDaikaoAdmitPending(id, row.admitRequestId);
      row = (await getDaikaoById(id)) || row;
    } else {
      throw new Error(
        `入谱申请审核中（变更单 #${row.admitRequestId}），请到「我的编修」打开该单修改后重新提交`,
      );
    }
  }
  if (row.admitStatus === "pending" && row.admitRequestId) {
    throw new Error(
      `入谱申请审核中（变更单 #${row.admitRequestId}），请到「我的编修」打开该单修改后重新提交`,
    );
  }
  if (!canAdmitDaikaoRow(row)) {
    throw new Error(
      row.reviewRequestId
        ? `该待考成员有进行中的编修单 #${row.reviewRequestId}，请先审结后再入谱`
        : "该待考成员尚有未完成的编修，暂不可入谱",
    );
  }
  return row;
}

export async function markDaikaoAdmitPending(
  daikaoId: number,
  requestId: number,
) {
  await ensureDaikaoAdmitColumns();
  await execute(
    `UPDATE tb_daikao_people SET
       admit_status = 'pending',
       admit_request_id = :requestId,
       admitted_people_id = NULL,
       admitted_at = NULL
     WHERE id = :id`,
    { id: daikaoId, requestId },
  );
}

export async function clearDaikaoAdmitPending(
  daikaoId: number,
  requestId?: number | null,
) {
  await ensureDaikaoAdmitColumns();
  if (requestId != null) {
    await execute(
      `UPDATE tb_daikao_people SET
         admit_status = 'none',
         admit_request_id = NULL
       WHERE id = :id
         AND admit_status = 'pending'
         AND (admit_request_id = :requestId OR admit_request_id IS NULL)`,
      { id: daikaoId, requestId },
    );
  } else {
    await execute(
      `UPDATE tb_daikao_people SET
         admit_status = 'none',
         admit_request_id = NULL
       WHERE id = :id AND admit_status = 'pending'`,
      { id: daikaoId },
    );
  }
}

export async function markDaikaoAdmitted(
  daikaoId: number,
  peopleId: number,
  requestId: number,
) {
  await ensureDaikaoAdmitColumns();
  await execute(
    `UPDATE tb_daikao_people SET
       admit_status = 'admitted',
       admit_request_id = :requestId,
       admitted_people_id = :peopleId,
       admitted_at = NOW()
     WHERE id = :id`,
    { id: daikaoId, peopleId, requestId },
  );
}

export function getSourceDaikaoId(
  payload: unknown,
): number | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as { sourceDaikaoId?: unknown }).sourceDaikaoId;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function splitGroup(raw: string | null | undefined) {
  const s = (raw || "").trim();
  if (!s) {
    return {
      groupRaw: null as string | null,
      group1: null as string | null,
      group2: null as string | null,
      group3: null as string | null,
    };
  }
  const parts = s.split(/[,，]/).map((x) => x.trim());
  return {
    groupRaw: s,
    group1: parts[0] || null,
    group2: parts[1] || null,
    group3: parts[2] || null,
  };
}

function generationLabelOf(level: number | null | undefined) {
  if (level == null || !Number.isFinite(Number(level))) return null;
  return `${Number(level)}代`;
}

export async function searchDaikaoGroups(q?: string, limit = 20) {
  if (!(await tableExists("tb_daikao_people"))) return [] as {
    id: number;
    name: string;
    fullName: string;
  }[];
  await ensureDaikaoSchema();
  const params: Record<string, unknown> = {
    limit: Math.min(50, Math.max(1, limit)),
  };
  let where = "group_raw IS NOT NULL AND TRIM(group_raw) <> ''";
  if (q?.trim()) {
    where +=
      " AND (group_raw LIKE :q OR group1 LIKE :q OR group2 LIKE :q OR group3 LIKE :q)";
    params.q = `%${q.trim()}%`;
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT MAX(id) AS id, group_raw AS fullName
     FROM tb_daikao_people
     WHERE ${where}
     GROUP BY group_raw
     ORDER BY COUNT(*) DESC, MAX(id) DESC
     LIMIT :limit`,
    params,
  );
  return rows.map((r) => {
    const name = String(r.fullName || "");
    return { id: Number(r.id), name, fullName: name };
  });
}

type DaikaoParentSnap = {
  id: number;
  name: string;
  spectrumNo: string | null;
  generation: number | null;
  groupRaw: string | null;
};

async function loadDaikaoParentSnap(
  conn: PoolConnection,
  parentId: number,
): Promise<DaikaoParentSnap> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, name, spectrum_no, generation, group_raw
     FROM tb_daikao_people WHERE id = ? LIMIT 1`,
    [parentId],
  );
  const row = rows[0];
  if (!row) throw new Error("待考父节点不存在");
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    spectrumNo: row.spectrum_no != null ? String(row.spectrum_no) : null,
    generation: row.generation != null ? Number(row.generation) : null,
    groupRaw: row.group_raw != null ? String(row.group_raw) : null,
  };
}

async function insertDaikaoRow(
  conn: PoolConnection,
  payload: PeoplePayload,
  meta: {
    parentId: number | null;
    parentName: string;
    parentNo: string;
    level: number | null;
    groupRaw: string;
  },
) {
  const g = splitGroup(meta.groupRaw);
  const phone = normalizePhoneForStore(payload.phone);
  const idCard = normalizeIdCardForStore(payload.idCard);
  const rank =
    payload.rank ||
    (payload.siblingOrder != null
      ? rankLabelTraditional(payload.sex === "女" ? "女" : "男", payload.siblingOrder)
      : "");
  const [result] = await conn.execute<ResultSetHeader>(
    `INSERT INTO tb_daikao_people (
       source_file, source_line, volume, section_path, is_root, is_out_heir,
       indent_spaces, name, spectrum_no, generation, generation_label,
       group_raw, group1, group2, group3, description, sex, spouse, address,
       parent_id, parent_name, parent_no, pinyin, alias, zi, hao, birthday,
       deathday, phone, id_card, nation, ancestral_home, lng_lat, spouse_info, company,
       position, professional_title, college, degree, birth_father_id,
       birth_mother, current_mother, rank_label, admit_status
     ) VALUES (
       ?, 0, ?, NULL, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none'
     )`,
    [
      "平台录入",
      payload.volume || null,
      payload.isHeir === "1" ? 1 : 0,
      payload.name.trim(),
      payload.no || null,
      meta.level,
      generationLabelOf(meta.level),
      g.groupRaw,
      g.group1,
      g.group2,
      g.group3,
      payload.description || null,
      payload.sex === "女" ? "女" : "男",
      payload.spouse || null,
      payload.address || payload.ancestralHome || null,
      meta.parentId,
      meta.parentName || null,
      meta.parentNo || null,
      payload.pinyin || null,
      payload.alias || null,
      payload.zi || null,
      payload.hao || null,
      payload.birthday || null,
      payload.deathday || null,
      phone || null,
      idCard || null,
      payload.nation || null,
      payload.ancestralHome || null,
      payload.lngLat || null,
      payload.spouseInfo || null,
      payload.company || null,
      payload.position || null,
      payload.professionalTitle || null,
      payload.college || null,
      payload.degree || null,
      payload.birthFatherId || null,
      payload.birthMother || null,
      payload.currentMother || null,
      rank || null,
    ],
  );
  return Number(result.insertId);
}

async function upsertDaikaoSiblingMeta(
  conn: PoolConnection,
  peopleId: number,
  parentId: number | null,
  payload: PeoplePayload,
) {
  if (!parentId) return;
  await ensureDaikaoSiblingOrderTable();
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT d.id, d.sex, s.sort_no
     FROM tb_daikao_people d
     LEFT JOIN app_daikao_sibling_order s ON s.people_id = d.id
     WHERE d.parent_id = ?`,
    [parentId],
  );
  const siblings = rows.map((r) => ({
    id: Number(r.id),
    sex: String(r.sex || "男"),
    sortNo: r.sort_no != null ? Number(r.sort_no) : null,
  }));
  if (!siblings.some((s) => s.id === peopleId)) {
    siblings.push({
      id: peopleId,
      sex: payload.sex === "女" ? "女" : "男",
      sortNo: payload.siblingOrder ?? null,
    });
  }
  let order = [...siblings]
    .sort((a, b) => {
      const ao = a.sortNo ?? 9999;
      const bo = b.sortNo ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.id - b.id;
    })
    .map((s) => s.id);
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
      `INSERT INTO app_daikao_sibling_order (people_id, parent_id, sort_no, rank_label)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), sort_no=VALUES(sort_no), rank_label=VALUES(rank_label)`,
      [id, parentId, i, rank],
    );
    await conn.execute(
      `UPDATE tb_daikao_people SET rank_label = ? WHERE id = ?`,
      [rank, id],
    );
  }
}

export async function applyDaikaoCreate(
  conn: PoolConnection,
  payload: PeoplePayload,
) {
  await ensureDaikaoSchema();
  const asParentOf = payload.asParentOf || null;
  if (asParentOf) {
    return applyDaikaoCreateAsParent(conn, payload, asParentOf);
  }

  const parentId = payload.parentId ? Number(payload.parentId) : null;
  let level = payload.level ?? 1;
  let groupRaw = payload.group || "";
  let parentName = "";
  let parentNo = "";
  if (parentId) {
    const parent = await loadDaikaoParentSnap(conn, parentId);
    level = payload.level ?? (parent.generation != null ? parent.generation + 1 : 1);
    groupRaw = payload.group || parent.groupRaw || "";
    parentName = parent.name;
    parentNo = parent.spectrumNo || "";
  }
  if (!payload.name?.trim()) throw new Error("姓名不能为空");
  if (!groupRaw.trim()) throw new Error("请填写所属派户支");

  const id = await insertDaikaoRow(conn, payload, {
    parentId,
    parentName,
    parentNo,
    level,
    groupRaw,
  });
  await upsertDaikaoSiblingMeta(conn, id, parentId, payload);
  return id;
}

async function applyDaikaoCreateAsParent(
  conn: PoolConnection,
  payload: PeoplePayload,
  childId: number,
) {
  await ensureDaikaoSchema();
  const [children] = await conn.query<RowDataPacket[]>(
    `SELECT id, generation, group_raw, parent_id, parent_name, parent_no
     FROM tb_daikao_people WHERE id = ? LIMIT 1`,
    [childId],
  );
  const child = children[0];
  if (!child) throw new Error("目标待考成员不存在");
  const oldLevel = child.generation != null ? Number(child.generation) : 1;
  const oldParentId = child.parent_id != null ? Number(child.parent_id) : null;
  if (!payload.name?.trim()) throw new Error("姓名不能为空");
  const groupRaw = payload.group || String(child.group_raw || "");
  if (!groupRaw.trim()) throw new Error("请填写所属派户支");

  const id = await insertDaikaoRow(conn, payload, {
    parentId: oldParentId,
    parentName: String(child.parent_name || ""),
    parentNo: String(child.parent_no || ""),
    level: payload.level ?? oldLevel,
    groupRaw,
  });

  await conn.execute(
    `UPDATE tb_daikao_people SET
       parent_id = ?, parent_name = ?, parent_no = ?, generation = ?,
       generation_label = ?
     WHERE id = ?`,
    [
      id,
      payload.name.trim(),
      payload.no || "",
      oldLevel + 1,
      generationLabelOf(oldLevel + 1),
      childId,
    ],
  );
  await conn.execute(
    `UPDATE app_daikao_sibling_order SET parent_id = ? WHERE people_id = ?`,
    [id, childId],
  );
  await upsertDaikaoSiblingMeta(conn, id, oldParentId, payload);
  return id;
}

export async function applyDaikaoUpdate(
  conn: PoolConnection,
  id: number,
  payload: PeoplePayload,
) {
  await ensureDaikaoSchema();
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, parent_id FROM tb_daikao_people WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) throw new Error("待考成员不存在");
  if (!payload.name?.trim()) throw new Error("姓名不能为空");

  let parentId = payload.parentId ? Number(payload.parentId) : null;
  if (!parentId) {
    parentId = rows[0].parent_id != null ? Number(rows[0].parent_id) : null;
  }
  let parentName: string | null = null;
  let parentNo: string | null = null;
  let level = payload.level ?? null;
  let groupRaw = payload.group || "";
  if (parentId) {
    const parent = await loadDaikaoParentSnap(conn, parentId);
    parentName = parent.name;
    parentNo = parent.spectrumNo;
    if (level == null && parent.generation != null) {
      level = parent.generation + 1;
    }
    if (!groupRaw) groupRaw = parent.groupRaw || "";
  }
  const g = splitGroup(groupRaw);
  const phone = normalizePhoneForStore(payload.phone);
  const idCard = normalizeIdCardForStore(payload.idCard);
  const rank =
    payload.rank ||
    (payload.siblingOrder != null
      ? rankLabelTraditional(payload.sex === "女" ? "女" : "男", payload.siblingOrder)
      : "");

  await conn.execute(
    `UPDATE tb_daikao_people SET
       name = ?, spectrum_no = ?, generation = ?, generation_label = ?,
       group_raw = ?, group1 = ?, group2 = ?, group3 = ?, description = ?,
       sex = ?, spouse = ?, address = ?, volume = ?, parent_id = ?,
       parent_name = ?, parent_no = ?, is_out_heir = ?, pinyin = ?, alias = ?,
       zi = ?, hao = ?, birthday = ?, deathday = ?, phone = ?, id_card = ?, nation = ?,
       ancestral_home = ?, lng_lat = ?, spouse_info = ?, company = ?,
       position = ?, professional_title = ?, college = ?, degree = ?,
       birth_father_id = ?, birth_mother = ?, current_mother = ?, rank_label = ?
     WHERE id = ?`,
    [
      payload.name.trim(),
      payload.no || null,
      level,
      generationLabelOf(level),
      g.groupRaw,
      g.group1,
      g.group2,
      g.group3,
      payload.description || null,
      payload.sex === "女" ? "女" : "男",
      payload.spouse || null,
      payload.address || payload.ancestralHome || null,
      payload.volume || null,
      parentId,
      parentName,
      parentNo,
      payload.isHeir === "1" ? 1 : 0,
      payload.pinyin || null,
      payload.alias || null,
      payload.zi || null,
      payload.hao || null,
      payload.birthday || null,
      payload.deathday || null,
      phone || null,
      idCard || null,
      payload.nation || null,
      payload.ancestralHome || null,
      payload.lngLat || null,
      payload.spouseInfo || null,
      payload.company || null,
      payload.position || null,
      payload.professionalTitle || null,
      payload.college || null,
      payload.degree || null,
      payload.birthFatherId || null,
      payload.birthMother || null,
      payload.currentMother || null,
      rank || null,
      id,
    ],
  );

  if (parentId && (payload.rank || payload.siblingOrder != null || payload.parentId)) {
    await upsertDaikaoSiblingMeta(conn, id, parentId, payload);
  }
}

export async function applyDaikaoDelete(conn: PoolConnection, id: number) {
  await ensureDaikaoSchema();
  const [kids] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM tb_daikao_people WHERE parent_id = ? LIMIT 1`,
    [id],
  );
  if (kids[0]) throw new Error("该待考成员下仍有子代，请先处理子代后再删除");
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM tb_daikao_people WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) throw new Error("待考成员不存在");
  await conn.execute(`DELETE FROM app_daikao_sibling_order WHERE people_id = ?`, [
    id,
  ]);
  await conn.execute(`DELETE FROM tb_daikao_people WHERE id = ?`, [id]);
}

export async function applyDaikaoReorder(
  conn: PoolConnection,
  parentId: number,
  childIds: number[],
) {
  await ensureDaikaoSchema();
  if (!childIds.length) throw new Error("子节点列表为空");
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, sex FROM tb_daikao_people WHERE parent_id = ?`,
    [parentId],
  );
  const children = rows.map((r) => ({
    id: Number(r.id),
    sex: String(r.sex || "男"),
  }));
  const childSet = new Set(children.map((c) => c.id));
  if (childIds.some((cid) => !childSet.has(cid))) {
    throw new Error("排行调整包含无效子节点");
  }
  const provided = new Set(childIds);
  const rest = children.map((c) => c.id).filter((cid) => !provided.has(cid));
  const finalOrder = [...childIds, ...rest];
  const sexMap = new Map(children.map((c) => [c.id, c.sex]));
  for (let i = 0; i < finalOrder.length; i++) {
    const cid = finalOrder[i];
    const rank = rankLabelTraditional(sexMap.get(cid) || "男", i);
    await conn.execute(
      `INSERT INTO app_daikao_sibling_order (people_id, parent_id, sort_no, rank_label)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), sort_no=VALUES(sort_no), rank_label=VALUES(rank_label)`,
      [cid, parentId, i, rank],
    );
    await conn.execute(
      `UPDATE tb_daikao_people SET rank_label = ? WHERE id = ?`,
      [rank, cid],
    );
  }
}
