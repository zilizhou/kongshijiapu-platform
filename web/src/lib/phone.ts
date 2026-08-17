/**
 * 联系电话：同一字段存多个号码，入库用顿号「、」连接。
 * F_PHONE 扩到 60 字（utf8mb4 仍为 1 字节长度前缀，可 INSTANT DDL），约 5 个手机号。
 */
export const PEOPLE_PHONE_MAX_CHARS = 60;

const PHONE_SPLIT = /[、，,;；|/]+/;

export function parsePhones(input: string | null | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(input).split(PHONE_SPLIT)) {
    const t = part.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function formatPhones(phones: string[]): string {
  return parsePhones(phones.join("、")).join("、");
}

export function normalizePhoneForStore(
  input: string | null | undefined,
): string {
  const phone = formatPhones(parsePhones(input));
  if (phone.length > PEOPLE_PHONE_MAX_CHARS) {
    throw new Error(
      `联系电话过长（最多 ${PEOPLE_PHONE_MAX_CHARS} 字，约 5 个号码），请删减后再保存`,
    );
  }
  return phone;
}
