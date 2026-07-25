/** 规范化后比较，用于变更单「修改前后」高亮 */

export function normDiffValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v).trim();
}

export function isFieldChanged(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  if (!before) return false;
  return normDiffValue(before[key]) !== normDiffValue(after?.[key]);
}

export function formatBeforeValue(v: unknown): string {
  const s = normDiffValue(v);
  return s === "" ? "（空）" : s;
}
