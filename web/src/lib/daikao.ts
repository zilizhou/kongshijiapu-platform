import { RowDataPacket } from "mysql2";
import { AuthError } from "./auth";
import { execute, query } from "./db";
import { DaikaoRow, DaikaoUpdatePayload, Role, SessionUser } from "./types";

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
};

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
  };
}

const SELECT_COLS = `id, source_file, source_line, volume, section_path,
  is_root, is_out_heir, name, spectrum_no, generation, generation_label,
  group_raw, group1, group2, group3, children_sample, children_with_no,
  out_heirs, description, sex, spouse, address, parent_id, parent_name,
  parent_no, created_at`;

export async function searchDaikao(opts: {
  name?: string;
  no?: string;
  level?: string;
  group?: string;
  sourceFile?: string;
  volume?: string;
  section?: string;
  page?: number;
  pageSize?: number;
}) {
  if (!(await tableExists("tb_daikao_people"))) {
    return { items: [] as DaikaoRow[], total: 0, page: 1, pageSize: 10 };
  }

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
  const rows = await query<DaikaoDb[]>(
    `SELECT ${SELECT_COLS}
     FROM tb_daikao_people
     WHERE parent_id = :parentId
     ORDER BY id ASC`,
    { parentId },
  );
  return rows.map(mapRow);
}
