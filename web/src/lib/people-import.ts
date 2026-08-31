import ExcelJS from "exceljs";
import { formatPhones, parsePhones } from "./phone";
import type { PeoplePayload } from "./types";

/** 模板列：与「新增成员」字段对齐（中文表头便于 Excel 填写） */
export const IMPORT_COLUMNS = [
  { key: "name", header: "姓名", required: true, sample: "孔範例" },
  { key: "sex", header: "性别", required: true, sample: "男" },
  { key: "group", header: "所属派户支", required: true, sample: "零,始祖至中興祖" },
  { key: "level", header: "世代", required: false, sample: "70" },
  { key: "rank", header: "当前排行", required: false, sample: "長子" },
  { key: "parentName", header: "当前父姓名", required: false, sample: "" },
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
  { key: "phone", header: "联系电话", required: false, sample: "13800138000、13900139000" },
  { key: "idCard", header: "身份证号码", required: false, sample: "370882199001011234" },
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
  /** 父亲重名，待人工选择 */
  pendingParent?: boolean;
};

export type ParentCandidate = {
  id: number;
  name: string;
  sex: string;
  level: number | null;
  groupName: string | null;
  parentName: string | null;
  address: string | null;
  no: string | null;
};

export type PendingParentPick = {
  row: number;
  name: string;
  parentName: string;
  payload: PeoplePayload;
  candidates: ParentCandidate[];
  /** 库中精确同名总数（可能大于 candidates.length） */
  candidateTotal: number;
};

function tipForColumn(c: (typeof IMPORT_COLUMNS)[number]): string {
  if (c.required) return "必填";
  if (c.key === "parentName") return "姓名须唯一";
  if (c.key === "isHeir" || c.key === "originalData") return "是/否";
  return "";
}

/** 生成 Excel 导入模板（.xlsx，无编码问题） */
export async function buildImportTemplateXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "孔氏家谱编修平台";
  const ws = wb.addWorksheet("成员导入", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = IMPORT_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(12, Math.min(22, c.header.length * 2 + 4)),
  }));

  const tipRow = ws.addRow(IMPORT_COLUMNS.map((c) => tipForColumn(c)));
  tipRow.font = { color: { argb: "FF6B7280" }, size: 10 };
  tipRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF3F4F6" },
  };

  ws.addRow(IMPORT_COLUMNS.map((c) => c.sample));

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF5" },
  };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v !== null && "text" in v) {
    return String((v as { text: unknown }).text ?? "").trim();
  }
  if (typeof v === "object" && v !== null && "richText" in v) {
    const parts = (v as { richText: { text?: string }[] }).richText || [];
    return parts.map((p) => p.text || "").join("").trim();
  }
  if (typeof v === "object" && v !== null && "result" in v) {
    return cellToString((v as { result: unknown }).result);
  }
  return String(v).trim();
}

async function sheetToTable(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  // exceljs 类型与当前 Node Buffer 定义不完全兼容
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const table: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    // exceljs row.values 下标从 1 开始
    const cells: string[] = [];
    const max = Math.max(values.length - 1, IMPORT_COLUMNS.length);
    for (let i = 1; i <= max; i++) {
      cells.push(cellToString(values[i]));
    }
    if (cells.some((c) => c !== "")) table.push(cells);
  });
  return table;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
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

function parseImportTable(table: string[][]): {
  rows: ParsedImportRow[];
  errors: { row: number; error: string }[];
} {
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
      phone: formatPhones(parsePhones(get("联系电话") || "")),
      idCard: get("身份证号码") || "",
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

/** 解析上传文件：优先 .xlsx，亦兼容旧 CSV */
export async function parseImportFile(
  buffer: Buffer,
  filename: string,
): Promise<{
  rows: ParsedImportRow[];
  errors: { row: number; error: string }[];
}> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const table = await sheetToTable(buffer);
    return parseImportTable(table);
  }
  if (lower.endsWith(".xls")) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          error: "请使用 .xlsx 格式（可用 Excel「另存为」Excel 工作簿）",
        },
      ],
    };
  }
  // CSV / 其它按文本解析
  const text = buffer.toString("utf8");
  return parseImportTable(parseCsv(text));
}
