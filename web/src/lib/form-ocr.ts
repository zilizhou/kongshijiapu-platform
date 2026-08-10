import {
  type FormOcrMatchStatus,
  type FormOcrPerson,
  type FormOcrPreviewItem,
  type FormOcrSheetMeta,
} from "./form-ocr-types";
import { peopleToPayload } from "./people-client";
import { getPeopleById, searchPeople } from "./people";
import type { PeoplePayload, SessionUser } from "./types";
import { createRequest } from "./workflow";
import { searchTextVariants } from "./zh";

export type {
  FormOcrMatchStatus,
  FormOcrPerson,
  FormOcrPreviewItem,
  FormOcrSheetMeta,
} from "./form-ocr-types";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function inferSex(p: FormOcrPerson): "男" | "女" {
  if (p.sex === "男" || p.sex === "女") return p.sex;
  // 表中「妻姓名」有值多半为男性谱名；「夫姓名」有值多为女性
  if (trimStr(p.notes).includes("夫姓名") || trimStr(p.notes).includes("夫:")) {
    return "女";
  }
  return "男";
}

function childrenToDescription(children: string[] | undefined): string {
  if (!children?.length) return "";
  return children
    .map((c, i) => `子${["一", "二", "三", "四", "五"][i] || i + 1}：${c}`)
    .join("；");
}

/** 将登记表一列映射为 PeoplePayload（不含库内合并） */
export function extractedToPayload(
  p: FormOcrPerson,
  sheet?: FormOcrSheetMeta,
): PeoplePayload {
  const name = trimStr(p.name);
  const group =
    trimStr(p.groupHint) ||
    trimStr(sheet?.branchText).replace(/\s+/g, "") ||
    "";
  const childDesc = childrenToDescription(p.children);
  const descParts = [childDesc, trimStr(p.notes)].filter(Boolean);
  return {
    name,
    sex: inferSex(p),
    alias: trimStr(p.alias),
    birthday: trimStr(p.birthday),
    deathday: trimStr(p.deathday),
    degree: trimStr(p.degree),
    college: trimStr(p.college),
    company: trimStr(p.company),
    position: trimStr(p.position),
    professionalTitle: trimStr(p.professionalTitle),
    phone: trimStr(p.phone),
    spouse: trimStr(p.spouse),
    address: trimStr(p.address),
    ancestralHome: trimStr(p.address),
    group,
    description: descParts.join("\n"),
    originalData: "0",
  };
}

/** 用识别结果覆盖空字段 / 补全新信息，保留库内已有关系字段 */
function mergePayload(
  base: PeoplePayload,
  patch: PeoplePayload,
): PeoplePayload {
  const pick = (key: keyof PeoplePayload) => {
    const v = patch[key];
    if (v == null) return base[key];
    if (typeof v === "string" && !v.trim()) return base[key];
    return v;
  };
  return {
    ...base,
    name: base.name || patch.name,
    sex: pick("sex") as "男" | "女",
    alias: (pick("alias") as string) || "",
    birthday: (pick("birthday") as string) || "",
    deathday: (pick("deathday") as string) || "",
    degree: (pick("degree") as string) || "",
    college: (pick("college") as string) || "",
    company: (pick("company") as string) || "",
    position: (pick("position") as string) || "",
    professionalTitle: (pick("professionalTitle") as string) || "",
    phone: (pick("phone") as string) || "",
    spouse: (pick("spouse") as string) || "",
    address: (pick("address") as string) || "",
    ancestralHome: (pick("ancestralHome") as string) || "",
    group: (base.group || "").trim() || (patch.group || ""),
    description: (() => {
      const a = (base.description || "").trim();
      const b = (patch.description || "").trim();
      if (!b) return a;
      if (!a) return b;
      if (a.includes(b)) return a;
      return `${a}\n${b}`;
    })(),
    parentId: base.parentId,
    birthFatherId: base.birthFatherId,
    rank: base.rank,
    siblingOrder: base.siblingOrder,
    level: base.level,
    no: base.no,
    zi: base.zi,
    hao: base.hao,
    pinyin: base.pinyin,
    isHeir: base.isHeir,
    originalData: base.originalData ?? "0",
  };
}

function ocrConfig() {
  const apiKey =
    process.env.OCR_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.FORM_OCR_API_KEY ||
    "";
  const baseUrl = (
    process.env.OCR_API_BASE ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model =
    process.env.OCR_MODEL ||
    process.env.FORM_OCR_MODEL ||
    "gpt-4o";
  return { apiKey, baseUrl, model };
}

export function assertOcrConfigured() {
  const { apiKey } = ocrConfig();
  if (!apiKey) {
    throw new Error(
      "未配置识别服务：请在环境变量中设置 OCR_API_KEY（或 OPENAI_API_KEY），以及可选的 OCR_API_BASE、OCR_MODEL",
    );
  }
}

const SYSTEM_PROMPT = `你是孔氏家谱「常态化续修登记表」识别助手。
图片多为横向表格：右侧是字段名行标题，每一竖列是一位成员。
请识别表中每一位有「谱名」的成员，输出严格 JSON（不要 markdown 代码块）：
{
  "sheet": {
    "branchText": "表头派/户/支文字，如有",
    "fillerName": "填表人",
    "fillerPhone": "填表人电话"
  },
  "people": [
    {
      "name": "谱名",
      "alias": "又名",
      "sex": "男或女，能判断则填",
      "birthday": "生年原文",
      "deathday": "卒年原文",
      "degree": "学历",
      "college": "毕业学校",
      "company": "工作单位",
      "position": "职务",
      "professionalTitle": "职称",
      "phone": "联系电话",
      "spouse": "妻姓名或夫姓名",
      "children": ["子女姓名，按子一到子五"],
      "address": "现住址",
      "groupHint": "若能从派户支推断则填",
      "notes": "其它备注"
    }
  ]
}
规则：
1. 空单元格用空字符串或省略；不要编造看不清的字。
2. 子女空位不要放空字符串进数组。
3. 工作单位/职务/职称若挤在一格，尽量拆开；拆不开则全部放 company。
4. people 按表中从左到右（或从上到下）顺序。`;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("识别结果不是有效 JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeExtracted(data: unknown): {
  sheet: FormOcrSheetMeta;
  people: FormOcrPerson[];
} {
  if (!data || typeof data !== "object") {
    throw new Error("识别结果格式错误");
  }
  const root = data as Record<string, unknown>;
  const sheetRaw = (root.sheet || {}) as Record<string, unknown>;
  const sheet: FormOcrSheetMeta = {
    branchText: trimStr(sheetRaw.branchText),
    fillerName: trimStr(sheetRaw.fillerName),
    fillerPhone: trimStr(sheetRaw.fillerPhone),
  };
  const list = Array.isArray(root.people) ? root.people : [];
  const people: FormOcrPerson[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = trimStr(r.name);
    if (!name) continue;
    const children = Array.isArray(r.children)
      ? r.children.map((c) => trimStr(c)).filter(Boolean)
      : [];
    const sexRaw = trimStr(r.sex);
    people.push({
      name,
      alias: trimStr(r.alias),
      sex: sexRaw === "女" ? "女" : sexRaw === "男" ? "男" : undefined,
      birthday: trimStr(r.birthday),
      deathday: trimStr(r.deathday),
      degree: trimStr(r.degree),
      college: trimStr(r.college),
      company: trimStr(r.company),
      position: trimStr(r.position),
      professionalTitle: trimStr(r.professionalTitle),
      phone: trimStr(r.phone),
      spouse: trimStr(r.spouse),
      children,
      address: trimStr(r.address),
      groupHint: trimStr(r.groupHint),
      notes: trimStr(r.notes),
    });
  }
  if (!people.length) {
    throw new Error("未识别到谱名成员，请确认图片清晰且为续修登记表");
  }
  return { sheet, people };
}

export async function recognizeFormImage(opts: {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}): Promise<{ sheet: FormOcrSheetMeta; people: FormOcrPerson[]; model: string }> {
  assertOcrConfigured();
  const { apiKey, baseUrl, model } = ocrConfig();
  if (!ALLOWED_MIME.has(opts.mimeType)) {
    throw new Error("仅支持 JPG / PNG / WEBP / GIF 图片");
  }
  if (opts.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 8MB");
  }

  const dataUrl = `data:${opts.mimeType};base64,${opts.buffer.toString("base64")}`;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请识别这张《孔子世家谱常态化续修登记表》中的成员信息，输出 JSON。",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new Error(body.error?.message || `识别服务调用失败（HTTP ${res.status}）`);
  }
  const content = body.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("识别服务未返回内容");
  const parsed = normalizeExtracted(extractJsonObject(content));
  return { ...parsed, model };
}

async function matchPerson(
  extracted: FormOcrPerson,
  sheet: FormOcrSheetMeta,
): Promise<{
  matchStatus: FormOcrMatchStatus;
  matchedPeopleId?: number | null;
  candidates: FormOcrPreviewItem["candidates"];
  warning?: string;
}> {
  const name = trimStr(extracted.name);
  const found = await searchPeople({
    name,
    exactName: true,
    page: 1,
    pageSize: 50,
  });
  const variants = new Set(searchTextVariants(name));
  let exact = found.items.filter((x) => variants.has(x.name));

  const groupHint =
    trimStr(extracted.groupHint) || trimStr(sheet.branchText) || "";
  if (groupHint && exact.length > 1) {
    const hint = groupHint.replace(/\s+/g, "");
    const scoped = exact.filter((p) => {
      const g = (p.groupName || "").replace(/\s+/g, "");
      return g.includes(hint) || hint.includes(g) || g.includes(hint.slice(0, 4));
    });
    if (scoped.length) exact = scoped;
  }

  const candidates = exact.map((p) => ({
    id: p.id,
    name: p.name,
    sex: p.sex,
    level: p.level,
    groupName: p.groupName,
    parentName: p.parentName,
  }));

  if (exact.length === 1) {
    return {
      matchStatus: "unique",
      matchedPeopleId: exact[0].id,
      candidates,
    };
  }
  if (exact.length > 1) {
    return {
      matchStatus: "ambiguous",
      matchedPeopleId: null,
      candidates,
      warning: `库中有 ${exact.length} 位同名，请选择对应成员后再填入`,
    };
  }
  return {
    matchStatus: "none",
    matchedPeopleId: null,
    candidates: [],
    warning: "库中未找到同名成员，将按「新建」生成变更单（需补全派户支等必填项）",
  };
}

export async function buildFormOcrPreview(opts: {
  sheet: FormOcrSheetMeta;
  people: FormOcrPerson[];
}): Promise<FormOcrPreviewItem[]> {
  const out: FormOcrPreviewItem[] = [];
  for (let i = 0; i < opts.people.length; i++) {
    const extracted = opts.people[i];
    const patch = extractedToPayload(extracted, opts.sheet);
    const match = await matchPerson(extracted, opts.sheet);
    let payload = patch;
    let operation: "create" | "update" = "create";
    if (match.matchStatus === "unique" && match.matchedPeopleId) {
      const row = await getPeopleById(match.matchedPeopleId);
      if (row) {
        payload = mergePayload(peopleToPayload(row), patch);
        operation = "update";
      }
    }
    if (operation === "create" && !trimStr(payload.group)) {
      payload.group = "待补,零,零";
    }
    out.push({
      index: i,
      extracted,
      matchStatus: match.matchStatus,
      matchedPeopleId: match.matchedPeopleId,
      candidates: match.candidates,
      payload,
      operation,
      selected: match.matchStatus === "unique",
      warning: match.warning,
    });
  }
  return out;
}

export async function applyFormOcrItems(opts: {
  user: SessionUser;
  items: Array<{
    operation: "create" | "update";
    peopleId?: number | null;
    payload: PeoplePayload;
  }>;
  submit?: boolean;
}): Promise<
  Array<{
    name: string;
    ok: boolean;
    requestId?: number;
    error?: string;
  }>
> {
  const results: Array<{
    name: string;
    ok: boolean;
    requestId?: number;
    error?: string;
  }> = [];

  for (const item of opts.items) {
    const name = item.payload.name?.trim() || "";
    try {
      if (!name) throw new Error("姓名不能为空");
      if (item.operation === "update") {
        const id = Number(item.peopleId);
        if (!id) throw new Error("缺少成员 ID");
        const exists = await getPeopleById(id);
        if (!exists) throw new Error("成员不存在");
        const req = await createRequest({
          user: opts.user,
          operation: "update",
          objectId: id,
          payload: item.payload,
          submit: !!opts.submit,
        });
        if (!req?.id) throw new Error("创建变更单失败");
        results.push({ name, ok: true, requestId: req.id });
      } else {
        if (!trimStr(item.payload.group)) {
          throw new Error("新建须填写所属派户支");
        }
        const req = await createRequest({
          user: opts.user,
          operation: "create",
          payload: item.payload,
          submit: !!opts.submit,
        });
        if (!req?.id) throw new Error("创建变更单失败");
        results.push({ name, ok: true, requestId: req.id });
      }
    } catch (e) {
      results.push({
        name,
        ok: false,
        error: e instanceof Error ? e.message : "创建变更单失败",
      });
    }
  }
  return results;
}

export function validateImageUpload(file: {
  size: number;
  type: string;
}): void {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error("仅支持 JPG / PNG / WEBP / GIF 图片");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 8MB");
  }
}
