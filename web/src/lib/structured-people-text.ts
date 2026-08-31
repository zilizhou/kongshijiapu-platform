import { nameToPinyin } from "./pinyin";
import { formatPhones, parsePhones } from "./phone";
import type { PeoplePayload } from "./types";

/** 结构化续修文本解析出的一人 */
export interface ParsedPerson {
  index: number;
  name: string;
  birthday?: string;
  deathday?: string;
  degree?: string;
  college?: string;
  company?: string;
  phone?: string;
  idCard?: string;
  spouse?: string;
  sex?: "男" | "女";
  children: string[];
  address?: string;
}

function normalizeEmpty(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (/^（空）$|^暂无$|^无$|^—$|^-$|^空$/.test(s)) return "";
  return s;
}

/** 按「1. 姓名」切块；无编号时整段一人 */
export function splitPersonBlocks(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const re = /(?:^|\n)\s*(\d+)\s*[\.、．]\s*/g;
  const matches = [...raw.matchAll(re)];
  if (!matches.length) return [raw];

  const blocks: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const contentStart = (m.index ?? 0) + m[0].length;
    const contentEnd =
      i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length;
    const body = raw.slice(contentStart, contentEnd).trim();
    if (body) blocks.push(body);
  }
  return blocks;
}

/**
 * 从一行或多段中抽取「键：值」对。
 * 同一行可有多个键（用全角/半角空格分隔），如：生年：x　卒年：y
 */
function extractKeyValues(block: string): Map<string, string> {
  const map = new Map<string, string>();
  // 键名：中文、顿号、逗号等；值：直到下一个「键：」或行尾
  const kvRe =
    /([^\s：:]{1,20})\s*[：:]\s*([^：:\n]*?)(?=(?:\s+[^\s：:]{1,20}\s*[：:])|$)/g;

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    kvRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = kvRe.exec(trimmed)) !== null) {
      found = true;
      const key = m[1].trim();
      const val = normalizeEmpty(m[2]);
      if (!key) continue;
      // 后写覆盖先写（同键罕见）
      map.set(key, val);
    }
    if (!found && !map.has("__name_line__")) {
      // 留给首行姓名处理
    }
  }
  return map;
}

function firstLineName(block: string): string {
  const first = block.split("\n")[0]?.trim() || "";
  // 若首行本身是「键：值」，则无独立姓名行
  if (/^[^\s：:]{1,20}\s*[：:]/.test(first) && !/^[\u4e00-\u9fff]{1,8}$/.test(first)) {
    // 纯姓名行通常无冒号；带冒号的不当姓名
    if (/[：:]/.test(first)) return "";
  }
  // 去掉可能残留编号
  const name = first.replace(/^\d+\s*[\.、．]\s*/, "").trim();
  if (/[：:]/.test(name)) return "";
  return normalizeEmpty(name);
}

function collectChildren(map: Map<string, string>): string[] {
  const labels = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const out: string[] = [];
  for (const n of labels) {
    for (const key of [`子女${n}`, `子${n}`, `女${n}`]) {
      const v = map.get(key);
      if (v) {
        out.push(`${key === `子女${n}` ? `子女${n}` : key}：${v}`);
        break;
      }
    }
  }
  // 也接受「子女：甲、乙」整段
  if (!out.length) {
    const all = map.get("子女");
    if (all) out.push(`子女：${all}`);
  }
  return out;
}

function parseOneBlock(block: string, index: number): ParsedPerson | null {
  const name = firstLineName(block);
  const map = extractKeyValues(block);
  if (!name && !map.size) return null;

  let spouse = normalizeEmpty(map.get("妻") || map.get("妻姓名") || "");
  let sex: "男" | "女" | undefined;
  if (spouse) sex = "男";
  const husband = normalizeEmpty(map.get("夫") || map.get("夫姓名") || "");
  if (husband) {
    spouse = husband;
    sex = "女";
  }

  const company =
    normalizeEmpty(
      map.get("工作单位、职务、职称") ||
        map.get("工作单位职务职称") ||
        map.get("工作单位") ||
        "",
    ) || undefined;

  const children = collectChildren(map);
  const resolvedName = name || normalizeEmpty(map.get("谱名") || map.get("姓名") || "");
  if (!resolvedName) return null;

  return {
    index,
    name: resolvedName,
    birthday: normalizeEmpty(map.get("生年") || "") || undefined,
    deathday: normalizeEmpty(map.get("卒年") || "") || undefined,
    degree: normalizeEmpty(map.get("学历") || "") || undefined,
    college: normalizeEmpty(map.get("毕业学校") || map.get("毕业院校") || "") || undefined,
    company,
    phone: formatPhones(parsePhones(normalizeEmpty(map.get("联系电话") || map.get("电话") || ""))) || undefined,
    idCard:
      normalizeEmpty(map.get("身份证号码") || map.get("身份证号") || map.get("身份证") || "") ||
      undefined,
    spouse: spouse || undefined,
    sex,
    children,
    address: normalizeEmpty(map.get("现住址") || map.get("住址") || "") || undefined,
  };
}

export function parseStructuredPeopleText(text: string): ParsedPerson[] {
  const blocks = splitPersonBlocks(text);
  const people: ParsedPerson[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const p = parseOneBlock(blocks[i], i);
    if (p) people.push(p);
  }
  return people;
}

/** 转为表单补丁（仅含有值的字段；姓名自动带拼音） */
export function parsedPersonToPayloadPatch(
  p: ParsedPerson,
): Partial<PeoplePayload> {
  const patch: Partial<PeoplePayload> = {
    name: p.name,
    pinyin: nameToPinyin(p.name),
  };
  if (p.sex) patch.sex = p.sex;
  if (p.birthday) patch.birthday = p.birthday;
  if (p.deathday) patch.deathday = p.deathday;
  if (p.degree) patch.degree = p.degree;
  if (p.college) patch.college = p.college;
  if (p.company) patch.company = p.company;
  if (p.phone) patch.phone = p.phone;
  if (p.idCard) patch.idCard = p.idCard;
  if (p.spouse) patch.spouse = p.spouse;
  if (p.address) {
    patch.address = p.address;
    patch.ancestralHome = p.address;
  }
  if (p.children.length) {
    patch.description = p.children.join("；");
  }
  return patch;
}

/** 合并补丁到现有 payload，强制保留父子/派户支/代数上下文 */
export function mergeStructuredPatch(
  prev: PeoplePayload,
  patch: Partial<PeoplePayload>,
): PeoplePayload {
  const next: PeoplePayload = { ...prev };
  for (const [k, v] of Object.entries(patch) as Array<
    [keyof PeoplePayload, PeoplePayload[keyof PeoplePayload]]
  >) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    (next as Record<string, unknown>)[k] = v;
  }
  // 住址填入时：仅当原祖籍为空才同步 ancestralHome
  if (patch.address && (prev.ancestralHome || "").trim()) {
    next.ancestralHome = prev.ancestralHome;
  }
  next.parentId = prev.parentId;
  next.group = prev.group;
  next.level = prev.level;
  return next;
}
