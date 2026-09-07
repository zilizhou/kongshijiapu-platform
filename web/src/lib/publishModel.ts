/** 出版稿前端可安全引用的类型与合并逻辑（不含数据库） */

export type PublishEntry = {
  id: number;
  name: string;
  sex: string;
  level: number | null;
  rank: string | null;
  /**
   * 姓名下小字，顺序固定：生年 → 妻 → 子N+名 → 住址
   * 例：一九六五年生妻惠氏子三德成德伦德林以上住水城民主村
   */
  bio: string;
  isFocus?: boolean;
};

export type PublishGeneration = {
  level: number | null;
  label: string;
  entries: PublishEntry[];
};

export type PublishPayload = {
  mode: "person" | "branch";
  title: string;
  subtitle: string;
  generations: PublishGeneration[];
  total: number;
  focusId?: number;
  /** 派户支命中总数（可能大于本刊收录） */
  matchedTotal?: number;
  /** 本刊从第几人起（0 起） */
  offset?: number;
  /** 因单次上限被截断 */
  truncated?: boolean;
};

/** 单次按派户支收录上限，避免「全部」把请求/浏览器撑死 */
export const PUBLISH_BRANCH_MAX = 2000;
/** 点打印时再拉全量的单次上限（预览仍用较少人数） */
export const PUBLISH_PRINT_MAX = 4000;

export function mergePublishPayloads(parts: PublishPayload[]): PublishPayload {
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const byLevel = new Map<number | null, PublishEntry[]>();
  const labels = new Map<number | null, string>();
  const seen = new Set<number>();
  for (const part of parts) {
    for (const g of part.generations) {
      labels.set(g.level, g.label);
      const list = byLevel.get(g.level) || [];
      for (const e of g.entries) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        list.push(e);
      }
      byLevel.set(g.level, list);
    }
  }
  const generations = [...byLevel.entries()]
    .sort((a, b) => (a[0] ?? 9999) - (b[0] ?? 9999))
    .map(([level, entries]) => ({
      level,
      label: labels.get(level) || (level == null ? "世次未详" : `第${level}世`),
      entries,
    }));
  const total = generations.reduce((n, g) => n + g.entries.length, 0);
  const matched = first.matchedTotal ?? total;
  const offset = first.offset ?? 0;
  return {
    ...first,
    generations,
    total,
    matchedTotal: matched,
    offset,
    truncated: offset + total < matched,
    subtitle: `派户支「${first.subtitle.match(/「([^」]+)」/)?.[1] || ""}」· 匹配 ${matched} 人 · 本刊收录 ${total} 人`,
  };
}
