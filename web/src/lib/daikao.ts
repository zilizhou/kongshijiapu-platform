import { RowDataPacket } from "mysql2";
import { AuthError } from "./auth";
import { execute, query } from "./db";
import { searchPeople } from "./people";
import { nameToPinyin } from "./pinyin";
import {
  DaikaoAdmitStatus,
  DaikaoRow,
  DaikaoUpdatePayload,
  PeoplePayload,
  Role,
  SessionUser,
} from "./types";
import { searchTextVariants } from "./zh";

const tableExistsCache = new Map<string, boolean>();
let admitColumnsReady = false;

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
  };
}

const SELECT_COLS = `id, source_file, source_line, volume, section_path,
  is_root, is_out_heir, name, spectrum_no, generation, generation_label,
  group_raw, group1, group2, group3, children_sample, children_with_no,
  out_heirs, description, sex, spouse, address, parent_id, parent_name,
  parent_no, created_at,
  admit_status, admit_request_id, admitted_people_id, admitted_at`;

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
    birthday: "",
    deathday: "",
    address: d.address || "",
    pinyin: nameToPinyin(d.name),
    alias: "",
    zi: "",
    hao: "",
    nation: "汉",
    isHeir: d.isOutHeir ? "1" : "0",
    originalData: "1",
    ancestralHome: "",
    lngLat: "",
    phone: "",
    parentId: parentId ?? null,
    birthFatherId: null,
    birthMother: "",
    currentMother: "",
    rank: "",
    spouse: d.spouse || "",
    spouseInfo: "",
    description: d.description || "",
    volume: d.volume || "",
    company: "",
    position: "",
    professionalTitle: "",
    college: "",
    degree: "",
    createTime: "",
    sourceDaikaoId: d.id,
  };
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
  page?: number;
  pageSize?: number;
}) {
  if (!(await tableExists("tb_daikao_people"))) {
    return { items: [] as DaikaoRow[], total: 0, page: 1, pageSize: 10 };
  }
  await ensureDaikaoAdmitColumns();

  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 10));
  const where: string[] = ["1=1"];
  const params: Record<string, unknown> = {};

  if (opts.name?.trim()) {
    where.push("name LIKE :name");
    params.name = `%${opts.name.trim()}%`;
  }
  if (opts.no?.trim()) {
    where.push("spectrum_no LIKE :no");
    params.no = `%${opts.no.trim()}%`;
  }
  if (opts.level?.trim()) {
    const n = Number(opts.level);
    if (!Number.isNaN(n)) {
      where.push("generation = :level");
      params.level = n;
    }
  }
  if (opts.group?.trim()) {
    where.push(
      "(group_raw LIKE :group OR group1 LIKE :group OR group2 LIKE :group OR group3 LIKE :group OR section_path LIKE :group)",
    );
    params.group = `%${opts.group.trim()}%`;
  }
  if (opts.sourceFile?.trim()) {
    where.push("source_file = :sourceFile");
    params.sourceFile = opts.sourceFile.trim();
  }
  if (opts.volume?.trim()) {
    where.push("volume LIKE :volume");
    params.volume = `%${opts.volume.trim()}%`;
  }
  if (opts.section?.trim()) {
    where.push("section_path LIKE :section");
    params.section = `%${opts.section.trim()}%`;
  }
  if (opts.admitStatus?.trim()) {
    where.push("admit_status = :admitStatus");
    params.admitStatus = opts.admitStatus.trim();
  }

  const whereSql = where.join(" AND ");
  const countRows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM tb_daikao_people WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.c || 0);
  const offset = (page - 1) * pageSize;
  params.limit = pageSize;
  params.offset = offset;

  const rows = await query<DaikaoDb[]>(
    `SELECT ${SELECT_COLS}
     FROM tb_daikao_people
     WHERE ${whereSql}
     ORDER BY source_file ASC, id ASC
     LIMIT :limit OFFSET :offset`,
    params,
  );

  return {
    items: rows.map(mapRow),
    total,
    page,
    pageSize,
  };
}

export async function getDaikaoById(id: number): Promise<DaikaoRow | null> {
  if (!(await tableExists("tb_daikao_people"))) return null;
  await ensureDaikaoAdmitColumns();
  const rows = await query<DaikaoDb[]>(
    `SELECT ${SELECT_COLS} FROM tb_daikao_people WHERE id = :id LIMIT 1`,
    { id },
  );
  return rows[0] ? mapRow(rows[0]) : null;
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
  await ensureDaikaoAdmitColumns();
  const rows = await query<DaikaoDb[]>(
    `SELECT ${SELECT_COLS}
     FROM tb_daikao_people
     WHERE parent_id = :parentId
     ORDER BY id ASC`,
    { parentId },
  );
  return rows.map(mapRow);
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
  parentMatch: "none" | "unique" | "ambiguous";
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
  parentMatch: "none" | "unique" | "ambiguous";
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
