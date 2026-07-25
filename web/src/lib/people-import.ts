import type { PeoplePayload } from "./types";

/** 模板列：与「新增成员」字段对齐（中文表头便于 Excel 填写） */
export const IMPORT_COLUMNS = [
  { key: "name", header: "姓名", required: true, sample: "孔範例" },
  { key: "sex", header: "性别", required: true, sample: "男" },
  { key: "group", header: "所属派户支", required: true, sample: "零,始祖至中興祖" },
  { key: "level", header: "世代", required: false, sample: "70" },
  { key: "rank", header: "当前排行", required: false, sample: "長子" },
  { key: "parentId", header: "当前父ID", required: false, sample: "" },
  { key: "parentName", header: "当前父姓名", required: false, sample: "" },
  { key: "birthFatherId", header: "原生父ID", required: false, sample: "" },
  { key: "birthMother", header: "原生母姓名", required: false, sample: "" },
  { key: "currentMother", header: "当前母姓名", required: false, sample: "" },
  { key: "zi", header: "字", required: false, sample: "" },
  { key: "hao", header: "号", required: false, sample: "" },
  { key: "alias", header: "别名", required: false, sample: "" },
  { key: "pinyin", header: "姓名拼音", required: false, sample: "kong fan li" },
  { key: "nation", header: "民族", required: false, sample: "汉" },
  { key: "birthday", header: "出生时间", required: false, sample: "1990" },
  { key: "deathday", header: "卒年", required: false, sample: "" },
  { key: "isHeir", header: "是否出嗣", required: false, sample: "否" },
  { key: "originalData", header: "是否源自原始谱书", required: false, sample: "是" },
  { key: "ancestralHome", header: "住址或祖籍", required: false, sample: "" },
  { key: "address", header: "详细地址", required: false, sample: "" },
  { key: "volume", header: "祖籍/卷次", required: false, sample: "" },
  { key: "phone", header: "联系电话", required: false, sample: "" },
  { key: "spouse", header: "配偶姓名", required: false, sample: "" },
  { key: "spouseInfo", header: "配偶补充信息", required: false, sample: "" },
  { key: "description", header: "描述信息", required: false, sample: "" },
  { key: "company", header: "工作单位", required: false, sample: "" },
  { key: "position", header: "职位", required: false, sample: "" },
  { key: "professionalTitle", header: "职称", required: false, sample: "" },
  { key: "college", header: "毕业院校", required: false, sample: "" },
  { key: "degree", header: "学历", required: false, sample: "" },
  { key: "no", header: "谱号", required: false, sample: "" },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];

export type ImportRowResult = {
  row: number;
  name: string;
  ok: boolean;
  requestId?: number;
  error?: string;
};

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** 生成带 BOM 的 CSV，Excel 可直接打开 */
export function buildImportTemplateCsv(): string {
  const headers = IMPORT_COLUMNS.map((c) => c.header);
  const sample = IMPORT_COLUMNS.map((c) => c.sample);
  const tip = IMPORT_COLUMNS.map((c) =>
    c.required ? "必填" : c.key === "parentId" ? "有父则填成员ID" : "",
  );
  const lines = [
    headers.map(csvEscape).join(","),
    tip.map(csvEscape).join(","),
    sample.map(csvEscape).join(","),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      if (ch === "\r" && text[i + 1] === "\n") i += 2;
      else i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function ynToFlag(v: string, yesDefault: "0" | "1"): "0" | "1" {
  const s = v.trim();
  if (!s) return yesDefault;
  if (["1", "是", "Y", "y", "true", "TRUE"].includes(s)) return "1";
  if (["0", "否", "N", "n", "false", "FALSE"].includes(s)) return "0";
  return yesDefault;
}

function toInt(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export type ParsedImportRow = {
  row: number;
  payload: PeoplePayload;
  parentName?: string;
};

/**
 * 解析上传 CSV。支持：
 * - 第 1 行为中文表头
 * - 第 2 行若为「必填」说明则自动跳过
 * - 示例行若姓名=孔範例 且用户未改，也会导入（由用户删除即可）
 */
export function parseImportCsv(text: string): {
  rows: ParsedImportRow[];
  errors: { row: number; error: string }[];
} {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], errors: [{ row: 1, error: "文件为空或缺少表头" }] };
  }

  const header = table[0];
  const headerIndex = new Map<string, number>();
  header.forEach((h, idx) => {
    if (h) headerIndex.set(h.replace(/\s+/g, ""), idx);
  });

  const missingRequired = IMPORT_COLUMNS.filter(
    (c) => c.required && !headerIndex.has(c.header),
  );
  if (missingRequired.length) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          error: `缺少必填列：${missingRequired.map((c) => c.header).join("、")}`,
        },
      ],
    };
  }

  let dataStart = 1;
  // 跳过说明行（单元格含「必填」）
  if (table[1]?.some((c) => c.includes("必填"))) dataStart = 2;

  const rows: ParsedImportRow[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let r = dataStart; r < table.length; r++) {
    const line = table[r];
    const get = (headerName: string) => {
      const idx = headerIndex.get(headerName);
      if (idx == null) return "";
      return (line[idx] || "").trim();
    };

    const name = get("姓名");
    if (!name) {
      // 空行跳过
      if (line.every((c) => !c.trim())) continue;
      errors.push({ row: r + 1, error: "姓名不能为空" });
      continue;
    }

    const sexRaw = get("性别") || "男";
    if (sexRaw !== "男" && sexRaw !== "女") {
      errors.push({ row: r + 1, error: "性别须为「男」或「女」" });
      continue;
    }
    const group = get("所属派户支");
    if (!group) {
      errors.push({ row: r + 1, error: "所属派户支不能为空" });
      continue;
    }

    const levelRaw = get("世代");
    let level: number | null = null;
    if (levelRaw) {
      level = toInt(levelRaw);
      if (level == null) {
        errors.push({ row: r + 1, error: "世代须为数字" });
        continue;
      }
    }

    const parentId = toInt(get("当前父ID"));
    if (get("当前父ID") && parentId == null) {
      errors.push({ row: r + 1, error: "当前父ID须为数字" });
      continue;
    }
    const birthFatherId = toInt(get("原生父ID"));
    if (get("原生父ID") && birthFatherId == null) {
      errors.push({ row: r + 1, error: "原生父ID须为数字" });
      continue;
    }

    const payload: PeoplePayload = {
      name,
      sex: sexRaw,
      group,
      level,
      rank: get("当前排行") || "",
      parentId,
      birthFatherId,
      birthMother: get("原生母姓名") || "",
      currentMother: get("当前母姓名") || "",
      zi: get("字") || "",
      hao: get("号") || "",
      alias: get("别名") || "",
      pinyin: get("姓名拼音") || "",
      nation: get("民族") || "",
      birthday: get("出生时间") || "",
      deathday: get("卒年") || "",
      isHeir: ynToFlag(get("是否出嗣"), "0"),
      originalData: ynToFlag(get("是否源自原始谱书"), "1"),
      ancestralHome: get("住址或祖籍") || "",
      address: get("详细地址") || "",
      volume: get("祖籍/卷次") || "",
      phone: get("联系电话") || "",
      spouse: get("配偶姓名") || "",
      spouseInfo: get("配偶补充信息") || "",
      description: get("描述信息") || "",
      company: get("工作单位") || "",
      position: get("职位") || "",
      professionalTitle: get("职称") || "",
      college: get("毕业院校") || "",
      degree: get("学历") || "",
      no: get("谱号") || "",
    };

    rows.push({
      row: r + 1,
      payload,
      parentName: get("当前父姓名") || undefined,
    });
  }

  return { rows, errors };
}
