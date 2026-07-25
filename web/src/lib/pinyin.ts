import { pinyin } from "pinyin-pro";

/** 中文姓名转拼音（无音调，小写，空格分隔；单字姓名无空格） */
export function nameToPinyin(name: string): string {
  const text = name.trim();
  if (!text) return "";
  return pinyin(text, {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  })
    .map((s) => String(s).toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
