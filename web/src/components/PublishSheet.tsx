"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PublishEntry, PublishPayload } from "@/lib/publish";

type FlatEntry = PublishEntry & { genLabel: string };

function flattenEntries(data: PublishPayload): FlatEntry[] {
  return data.generations.flatMap((g) =>
    g.entries.map((e) => ({ ...e, genLabel: g.label })),
  );
}

/** 小传固定拆成两列：右列先读（前半），左列后读（后半） */
function splitBioColumns(bio: string): { right: string; left: string } {
  const text = bio.replace(/\s+/g, "");
  const mid = Math.ceil(text.length / 2);
  return { right: text.slice(0, mid), left: text.slice(mid) };
}

function PersonStrip({ entry }: { entry: FlatEntry | PublishEntry }) {
  const female = entry.sex === "女";
  const cols = entry.bio ? splitBioColumns(entry.bio) : null;
  return (
    <div
      className={`publish-person ${entry.isFocus ? "publish-entry-focus" : ""}`}
      data-id={entry.id}
    >
      {female ? <span className="publish-circled-nv">女</span> : null}
      <div className="publish-name">{entry.name}</div>
      {cols ? (
        <div className="publish-details">
          <div className="publish-details-col">{cols.right}</div>
          <div className="publish-details-col">{cols.left}</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 竖排装箱：同一列内自上而下接排；列满后向左开新列；页宽用尽换页。
 * 每人不可拆列（整块迁到下一列/页）。
 * 列数按向下取整留余量，避免最后一列溢出贴到书脊。
 */
function packPages(
  items: FlatEntry[],
  heights: number[],
  personWidth: number,
  pageWidth: number,
  pageHeight: number,
  gapPx: number,
): FlatEntry[][] {
  if (!items.length) return [[]];
  // 左右各留余量，防止末列被裁切或压进书脊
  const limitW = Math.max(40, pageWidth - 20);
  const limitH = Math.max(40, pageHeight - 4);
  const colW = Math.max(18, personWidth + 2);
  const maxCols = Math.max(1, Math.floor(limitW / colW));

  const pages: FlatEntry[][] = [];
  let i = 0;

  while (i < items.length) {
    const start = i;
    let cols = 0;
    let colH = 0;

    while (i < items.length) {
      const h = Math.max(12, heights[i] || 24);
      const need = colH > 0 ? colH + gapPx + h : h;

      if (cols === 0) {
        cols = 1;
        if (h > limitH) {
          i += 1;
          break;
        }
        colH = h;
        i += 1;
        continue;
      }

      if (need <= limitH) {
        colH = need;
        i += 1;
        continue;
      }

      // 当前列满 → 若已达最大列数则换页
      if (cols >= maxCols) {
        break;
      }
      cols += 1;
      if (h > limitH) {
        i += 1;
        break;
      }
      colH = h;
      i += 1;
    }

    if (i === start) i += 1;
    pages.push(items.slice(start, i));
  }

  return pages.length ? pages : [items];
}

function pagesSignature(pages: FlatEntry[][]): string {
  return pages.map((p) => p.map((e) => e.id).join(",")).join("|");
}

export function PublishSheet({
  data,
  emptyHint,
}: {
  data: PublishPayload | null;
  emptyHint?: string;
}) {
  const flat = useMemo(() => (data ? flattenEntries(data) : []), [data]);
  const measureRef = useRef<HTMLDivElement>(null);
  const widthProbeRef = useRef<HTMLDivElement>(null);
  const pagesSigRef = useRef("");
  const [pages, setPages] = useState<FlatEntry[][]>([]);

  useLayoutEffect(() => {
    if (!flat.length) {
      pagesSigRef.current = "";
      setPages([]);
      return;
    }

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const probe = widthProbeRef.current;
      const box = measureRef.current;
      if (!probe || !box) {
        const fallback = [flat];
        const sig = pagesSignature(fallback);
        if (sig !== pagesSigRef.current) {
          pagesSigRef.current = sig;
          setPages(fallback);
        }
        return;
      }

      const pageHeight = box.clientHeight || probe.clientHeight || 640;
      // 版心宽：测量层若仍异常偏窄，按 A4 比例回退，避免「一列就换页」
      const framePad = 28;
      const spineW = 44;
      const a4ContentW = Math.min(640, pageHeight * (210 / 297)) - spineW - framePad;
      let pageWidth = probe.clientWidth || 0;
      if (pageWidth < 120) {
        pageWidth = Math.max(200, a4ContentW);
      }

      const nodes = [
        ...box.querySelectorAll<HTMLElement>(".publish-person"),
      ];
      const heights = nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return r.height > 1 ? r.height : n.offsetHeight || 24;
      });
      const widths = nodes
        .map((n) => {
          const r = n.getBoundingClientRect();
          return r.width > 1 ? r.width : n.offsetWidth || 0;
        })
        .filter((w) => w > 8 && w < pageWidth * 0.5);
      const sorted = [...widths].sort((a, b) => a - b);
      // 用偏大分位，避免低估栏宽导致多塞一列溢出
      const personWidth =
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))] ||
        sorted[0] ||
        40;

      // 与 .publish-person 的 margin-block-end / padding 对齐，避免装箱低估间距
      const gapPx = 18;
      const next = packPages(
        flat,
        heights,
        personWidth,
        pageWidth,
        pageHeight,
        gapPx,
      );
      const sig = pagesSignature(next);
      if (sig !== pagesSigRef.current) {
        pagesSigRef.current = sig;
        setPages(next);
      }
    };

    measure();
    const onResize = () => {
      window.requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [flat]);

  if (!data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-line bg-soft/50 px-6 py-10 text-center text-sm text-muted">
        {emptyHint ||
          "在左侧选择查询方式并点击查询，即可生成世系表用于打印或另存 PDF。"}
      </div>
    );
  }

  const displayPages = pages.length ? pages : [flat];

  return (
    <div className="publish-root">
      <div className="publish-meta no-print mb-3 text-sm text-muted">
        {data.subtitle} · 共 {data.total} 人 · {displayPages.length}{" "}
        页（列满向左，页满换页）
      </div>

      <div className="publish-measure no-print" aria-hidden>
        <section className="publish-page publish-page-probe">
          <aside className="publish-spine" />
          <div ref={widthProbeRef} className="publish-frame">
            <div ref={measureRef} className="publish-body publish-body-measure">
              {flat.map((entry) => (
                <PersonStrip key={`m-${entry.id}`} entry={entry} />
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="publish-pages">
        {displayPages.map((pageEntries, pageIndex) => (
          <section key={`page-${pageIndex}`} className="publish-page">
            <aside className="publish-spine font-display">
              <div className="publish-spine-inner whitespace-pre-line">
                {data.title}
              </div>
              <div className="publish-spine-level">
                第{pageIndex + 1}/{displayPages.length}页
              </div>
            </aside>

            <div className="publish-frame">
              <div className="publish-body publish-body-paged">
                {pageEntries.map((entry) => (
                  <PersonStrip key={`${pageIndex}-${entry.id}`} entry={entry} />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
