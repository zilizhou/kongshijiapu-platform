"use client";

import { useMemo, useState } from "react";

type Props = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** 左侧附加说明，如「共 100 条」 */
  leading?: string;
  /** 每页条数；提供则显示在分页栏左侧 */
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
};

function buildPages(page: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, total, page]);
  for (let d = 1; d <= 2; d++) {
    if (page - d >= 1) set.add(page - d);
    if (page + d <= total) set.add(page + d);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

export function PaginationBar({
  page,
  totalPages,
  onChange,
  leading,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
  className = "",
}: Props) {
  const pages = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), pages);
  const nums = useMemo(
    () => buildPages(current, pages),
    [current, pages],
  );
  const [draft, setDraft] = useState("");

  function go(n: number) {
    if (!Number.isFinite(n)) return;
    const next = Math.min(pages, Math.max(1, Math.floor(n)));
    if (next !== current) onChange(next);
  }

  function jump() {
    const n = Number(draft);
    if (!Number.isFinite(n)) return;
    go(n);
    setDraft("");
  }

  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-line bg-white px-2 text-sm text-ink transition hover:border-accent/40 hover:bg-soft disabled:cursor-not-allowed disabled:opacity-40";
  const btnActive =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-accent px-2 text-sm font-medium text-white";

  const showSize = pageSize != null && typeof onPageSizeChange === "function";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-sm ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-muted">
        {showSize ? (
          <select
            className="h-8 rounded-md border border-line bg-white px-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="每页条数"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}条/页
              </option>
            ))}
          </select>
        ) : null}
        {leading ? <span>{leading}</span> : null}
        <span>
          第 {current} / {pages} 页
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={btn}
          disabled={current <= 1}
          onClick={() => go(current - 1)}
        >
          上一页
        </button>

        {nums.map((n, i) =>
          n === "…" ? (
            <span
              key={`e-${i}`}
              className="inline-flex h-8 w-6 items-center justify-center text-muted"
            >
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={n === current ? btnActive : btn}
              onClick={() => go(n)}
            >
              {n}
            </button>
          ),
        )}

        <button
          type="button"
          className={btn}
          disabled={current >= pages}
          onClick={() => go(current + 1)}
        >
          下一页
        </button>

        <span className="mx-1 hidden h-4 w-px bg-line sm:inline-block" />

        <label className="ml-1 inline-flex items-center gap-1.5 text-muted">
          <span className="whitespace-nowrap">前往</span>
          <input
            type="number"
            min={1}
            max={pages}
            inputMode="numeric"
            className="h-8 w-14 shrink-0 rounded-md border border-line bg-white px-1.5 text-center text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            value={draft}
            placeholder={String(current)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") jump();
            }}
          />
          <span className="whitespace-nowrap">页</span>
        </label>
        <button type="button" className={btn} onClick={jump}>
          跳转
        </button>
      </div>
    </div>
  );
}
