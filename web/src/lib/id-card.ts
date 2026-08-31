/** 身份证号码：15 位旧证或 18 位（末位可为 X）。 */

export const ID_CARD_MAX_CHARS = 18;

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECKS = "10X98765432";

export function normalizeIdCard(input: string | null | undefined): string {
  return (input || "").trim().replace(/[\s　-]/g, "").toUpperCase();
}

function checksum18(id: string): boolean {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const n = Number(id[i]);
    if (!Number.isInteger(n)) return false;
    sum += n * WEIGHTS[i];
  }
  return CHECKS[sum % 11] === id[17];
}

export function isValidIdCard(id: string): boolean {
  if (!id) return true;
  if (/^\d{15}$/.test(id)) return true;
  if (/^\d{17}[\dX]$/.test(id)) return checksum18(id);
  return false;
}

export function normalizeIdCardForStore(
  input: string | null | undefined,
): string {
  const id = normalizeIdCard(input);
  if (!id) return "";
  if (!isValidIdCard(id)) {
    throw new Error("身份证号码格式不正确（须为 15 或 18 位，18 位末位可为 X）");
  }
  return id;
}
