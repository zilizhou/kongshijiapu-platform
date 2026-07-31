/** Format DB/JS datetime to `YYYY-MM-DD HH:mm:ss` in Asia/Shanghai (+08). */
export function formatDateTime(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    // 无时区的 MySQL 本地墙钟时间，按原样展示（库会话已是 +08）
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) {
      return trimmed.replace("T", " ").slice(0, 19);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) {
    const s = String(value).replace("T", " ");
    return s.slice(0, 19) || null;
  }

  // Date / 带 Z 或偏移的 ISO：统一转到东八区
  const formatted = d.toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });
  return formatted.replace("T", " ").slice(0, 19);
}
