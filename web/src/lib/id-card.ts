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

export type IdCardProfile = {
  birthday: string;
  sex: "男" | "女";
};

function formatYmd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const max = new Date(year, month, 0).getDate();
  if (day > max) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 从合法身份证解析出生日期（YYYY-MM-DD）与性别；不合法返回 null */
export function parseIdCardProfile(
  input: string | null | undefined,
): IdCardProfile | null {
  const id = normalizeIdCard(input);
  if (!id || !isValidIdCard(id)) return null;

  let year: number;
  let month: number;
  let day: number;
  let genderDigit: number;
  if (id.length === 18) {
    year = Number(id.slice(6, 10));
    month = Number(id.slice(10, 12));
    day = Number(id.slice(12, 14));
    genderDigit = Number(id[16]);
  } else {
    year = 1900 + Number(id.slice(6, 8));
    month = Number(id.slice(8, 10));
    day = Number(id.slice(10, 12));
    genderDigit = Number(id[14]);
  }
  if (!Number.isInteger(genderDigit)) return null;
  const birthday = formatYmd(year, month, day);
  if (!birthday) return null;
  return {
    birthday,
    sex: genderDigit % 2 === 1 ? "男" : "女",
  };
}
