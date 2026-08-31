import { extractCourtesyFromDescription } from "./courtesy";
import { formatPhones, parsePhones } from "./phone";
import type { PeoplePayload, PeopleRow } from "./types";
import { parseRankToIndex, rankLabelSimplified } from "./zh";

/** 提交前统一排行：文案与序号互相同步，避免只改文案却带上旧 siblingOrder */
export function normalizePeopleRank(payload: PeoplePayload): PeoplePayload {
  const sex = payload.sex === "女" ? "女" : "男";
  const parsed = parseRankToIndex(payload.rank || "");
  const idx = parsed ?? payload.siblingOrder;
  if (idx == null || !Number.isFinite(idx) || idx < 0) return payload;
  return {
    ...payload,
    siblingOrder: Math.floor(idx),
    rank: rankLabelSimplified(sex, Math.floor(idx)),
  };
}

/** 从别名串里去掉已结构化的字/号，避免表单重复 */
function stripCourtesyFromAlias(
  alias: string,
  zi: string,
  hao: string,
): string {
  let s = (alias || "").trim();
  if (!s) return "";
  if (zi) {
    s = s
      .replace(new RegExp(`字${zi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "g"), "")
      .trim();
  }
  if (hao) {
    s = s
      .replace(
        new RegExp(
          `[號号]${hao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
          "g",
        ),
        "",
      )
      .trim();
  }
  return s;
}

/** 纯前端可用：PeopleRow → 编修表单 payload */
export function peopleToPayload(p: PeopleRow): PeoplePayload {
  const extracted = extractCourtesyFromDescription(p.description);
  const zi = (p.zi || extracted.zi || "").trim();
  const hao = (p.hao || extracted.hao || "").trim();
  const alias = stripCourtesyFromAlias(p.alias || "", zi, hao);

  const sex = p.sex === "女" ? "女" : "男";
  const parsedRank = parseRankToIndex(p.rank || "");
  const siblingOrder =
    p.siblingOrder ?? (parsedRank != null ? parsedRank : null);
  const rank =
    siblingOrder != null
      ? rankLabelSimplified(sex, siblingOrder)
      : p.rank || "";

  return {
    name: p.name,
    sex,
    no: p.no || "",
    level: p.level,
    group: p.groupName || "",
    birthday: p.birthday || "",
    deathday: p.deathday || "",
    address: p.address || "",
    pinyin: p.pinyin || "",
    alias,
    zi,
    hao,
    nation: p.nation || "",
    isHeir: p.isHeir === "1" ? "1" : "0",
    originalData: p.originalData === "0" ? "0" : "1",
    ancestralHome: p.ancestralHome || "",
    lngLat: p.lngLat || "",
    phone: formatPhones(parsePhones(p.phone || "")),
    idCard: p.idCard || "",
    parentId: p.parentId,
    birthFatherId: p.birthFatherId,
    birthMother: p.birthMother || "",
    currentMother: p.currentMother || "",
    rank,
    siblingOrder,
    spouse: p.spouse || "",
    spouseInfo: p.spouseInfo || "",
    description: p.description || "",
    volume: p.volume || "",
    company: p.company || "",
    position: p.position || "",
    professionalTitle: p.professionalTitle || "",
    college: p.college || "",
    degree: p.degree || "",
    createTime: p.createTime || "",
  };
}
