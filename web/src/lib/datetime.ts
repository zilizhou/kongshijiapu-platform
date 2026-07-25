/** Format DB/JS datetime to `YYYY-MM-DD HH:mm:ss` (local / +08). */
export function formatDateTime(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    // Already ISO / MySQL style
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.replace("T", " ").slice(0, 19);
    }
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const s = String(value).replace("T", " ");
    return s.slice(0, 19) || null;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
