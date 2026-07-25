/**
 * 从谱文小传中抽取「字」「号」。
 * 常见：字子上通習兵書… / 號存齋宋理宗…
 */

// 勿把「淸/清」放进停止词（如字景淸）
const ZI_STOP =
  "家語|又名|初名|通|習|习|爲|为|年|子[一二三四五六七八九十]|篤|笃|少|長|长|誕|诞|幼|有|從|从|漢|汉|宋|齊|齐|楚|葬|塟|卒|善|又|能|博|沉|徵|征|以|於|于|與|与|隱|隐|永|代|廣|广|授|改|秉|養|养|性|郡|身|舉|举|無|无|克|榮|荣|哀|閒|闲|再|亟|夫|號|号";

const HAO_STOP =
  "宋|元|明|淸|清|永|歷|历|於|于|子|年|少|能|性|與|与|隱|隐|授|以|累|分|，|。|；|、|$";

export function extractCourtesyFromDescription(description: string | null | undefined): {
  zi: string;
  hao: string;
  /** 写入别名框，如「字子上」或「字景淸 號存齋」 */
  alias: string;
} {
  const text = (description || "").replace(/\s+/g, "").trim();
  if (!text) return { zi: "", hao: "", alias: "" };

  let zi = "";
  let hao = "";

  const ziRe = new RegExp(`^字([一-龥]{1,4}?)(?=${ZI_STOP})`);
  const ziMatch = text.match(ziRe) || text.match(/^字([一-龥]{2,3})/);
  if (ziMatch) zi = ziMatch[1];

  // 排除：號稱；郡號/縣號等
  const haoRe = new RegExp(
    `(?<![郡縣县州府邑])號(?!稱|称)([一-龥]{1,6}?)(?=${HAO_STOP})`,
  );
  const haoMatch = text.match(haoRe);
  if (haoMatch) hao = haoMatch[1];

  const parts: string[] = [];
  if (zi) parts.push(`字${zi}`);
  if (hao) parts.push(`號${hao}`);
  return { zi, hao, alias: parts.join(" ") };
}

/** 规范化字/号：去掉前缀「字」「号/號」 */
export function normalizeCourtesyPart(
  kind: "zi" | "hao",
  raw: string | null | undefined,
): string {
  let s = (raw || "").trim();
  if (!s) return "";
  if (kind === "zi") s = s.replace(/^字/, "");
  if (kind === "hao") s = s.replace(/^[號号]/, "");
  return s.trim();
}

/** 兼容旧 F_ALIAS：字/号拼成展示串 */
export function composeLegacyAlias(
  zi: string,
  hao: string,
  otherAlias = "",
): string {
  const parts: string[] = [];
  const z = normalizeCourtesyPart("zi", zi);
  const h = normalizeCourtesyPart("hao", hao);
  if (z) parts.push(`字${z}`);
  if (h) parts.push(`號${h}`);
  const other = (otherAlias || "").trim();
  if (other && !parts.some((p) => other.includes(p))) parts.push(other);
  return parts.join(" ");
}
