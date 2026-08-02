import * as OpenCC from "opencc-js";
import type { BranchPayload, PeoplePayload } from "./types";

const toTw = OpenCC.Converter({ from: "cn", to: "tw" });

/** 界面可输入简体；入库/检索统一转为繁体 */
export function toTraditional(input: string | null | undefined): string {
  if (!input) return "";
  return toTw(input);
}

/**
 * 检索用关键词变体：保留原文 + 繁体，并展开谱籍常见异体（如 峰/峯）。
 * OpenCC tw 会把「峯」规范成「峰」，而库中常保留「峯」，故不能只搜转换结果。
 */
export function searchTextVariants(input: string | null | undefined): string[] {
  const raw = (input || "").trim();
  if (!raw) return [];
  const set = new Set<string>([raw, toTraditional(raw)]);
  for (const s of [...set]) {
    set.add(s.replace(/峰/g, "峯"));
    set.add(s.replace(/峯/g, "峰"));
  }
  return [...set];
}

/** 生成 SQL LIKE 的 OR 条件与命名参数（params 前缀如 name / q） */
export function likeOrClause(
  columns: string[],
  variants: string[],
  paramPrefix: string,
  params: Record<string, unknown>,
): string {
  if (!variants.length) return "1=0";
  const parts: string[] = [];
  variants.forEach((v, i) => {
    const key = `${paramPrefix}${i}`;
    params[key] = `%${v}%`;
    for (const col of columns) {
      parts.push(`${col} LIKE :${key}`);
    }
  });
  return `(${parts.join(" OR ")})`;
}

const TEXT_KEYS: (keyof PeoplePayload)[] = [
  "name",
  "sex",
  "no",
  "group",
  "birthday",
  "deathday",
  "address",
  "pinyin",
  "alias",
  "zi",
  "hao",
  "nation",
  "ancestralHome",
  "lngLat",
  "phone",
  "birthMother",
  "currentMother",
  "rank",
  "spouse",
  "spouseInfo",
  "description",
  "volume",
  "company",
  "position",
  "professionalTitle",
  "college",
  "degree",
];

export function toTraditionalPayload(payload: PeoplePayload): PeoplePayload {
  const out: PeoplePayload = { ...payload };
  for (const key of TEXT_KEYS) {
    const v = out[key];
    if (typeof v === "string" && v) {
      (out as Record<string, unknown>)[key] = toTraditional(v);
    }
  }
  return out;
}

const BRANCH_TEXT_KEYS: (keyof BranchPayload)[] = [
  "name",
  "fullName",
  "book",
  "person",
  "volume",
  "remark",
  "personParentName",
  "personParentNo",
];

export function toTraditionalBranchPayload(
  payload: BranchPayload,
): BranchPayload {
  const out: BranchPayload = { ...payload };
  for (const key of BRANCH_TEXT_KEYS) {
    const v = out[key];
    if (typeof v === "string" && v) {
      (out as Record<string, unknown>)[key] = toTraditional(v);
    }
  }
  return out;
}

const RANK_HEADS_TRAD = ["長", "次", "三", "四", "五", "六", "七", "八", "九", "十"];
const RANK_HEADS_SIMP = ["长", "次", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 排行标签（繁体）：長子/次子/三子… 或 長女/次女…；index 从 0 起 */
export function rankLabelTraditional(sex: string, index: number): string {
  const head = RANK_HEADS_TRAD[index] || String(index + 1);
  return `${head}${sex === "女" ? "女" : "子"}`;
}

/** 排行标签（简体，表单展示用）；index 从 0 起 */
export function rankLabelSimplified(sex: string, index: number): string {
  const head = RANK_HEADS_SIMP[index] || String(index + 1);
  return `${head}${sex === "女" ? "女" : "子"}`;
}

/**
 * 解析排行文案或序号为 0 起下标。
 * 支持：1 / 2、长子/次子/三女、長子、二子 等。
 */
export function parseRankToIndex(input: string): number | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 ? n - 1 : null;
  }
  const t = toTraditional(raw).replace(/^第/, "");
  const headMap: Record<string, number> = {
    長: 0,
    元: 0,
    孟: 0,
    次: 1,
    二: 1,
    三: 2,
    四: 3,
    五: 4,
    六: 5,
    七: 6,
    八: 7,
    九: 8,
    十: 9,
  };
  const m = t.match(/^(長|元|孟|次|二|三|四|五|六|七|八|九|十)([子女])?$/);
  if (m && headMap[m[1]] != null) return headMap[m[1]];
  const mNum = t.match(/^(\d+)([子女])?$/);
  if (mNum) {
    const n = Number(mNum[1]);
    return n >= 1 ? n - 1 : null;
  }
  return null;
}

/** 从排行文案解析子/女；无法判断时返回 null */
export function parseRankGender(input: string): "男" | "女" | null {
  const t = toTraditional((input || "").trim());
  if (/女$/.test(t) || t.includes("女")) return "女";
  if (/子$/.test(t) || t.includes("子")) return "男";
  return null;
}
