/** 家谱成员缴费状态：仅本平台新录入展示；旧谱 NULL 视为已交费 */

export type PeopleFeeStatus = "paid" | "unpaid";

export function isPeopleFeeStatus(v: unknown): v is PeopleFeeStatus {
  return v === "paid" || v === "unpaid";
}

export function parsePeopleFeeStatus(
  input: unknown,
): PeopleFeeStatus | null {
  const s = String(input || "")
    .trim()
    .toLowerCase();
  if (s === "paid" || s === "unpaid") return s;
  return null;
}

/** 新增落库：未写则未交费 */
export function feeStatusForInsert(input: unknown): PeopleFeeStatus {
  return input === "paid" ? "paid" : "unpaid";
}

export function peopleFeeStatusLabel(status: PeopleFeeStatus): string {
  return status === "paid" ? "已交费" : "未交费";
}

/** 列表/详情：仅新录入显示；缺省当作未交费 */
export function displayFeeStatus(input: {
  createAdmin?: string | null;
  feeStatus?: string | null;
}): PeopleFeeStatus | null {
  if ((input.createAdmin || "").trim() !== "platform") return null;
  return input.feeStatus === "paid" ? "paid" : "unpaid";
}
