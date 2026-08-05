"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { PublishEntry, PublishPayload } from "@/lib/publish";
import {
  DEFAULT_PAPER,
  paperCssVars,
  paperPrintCss,
  paperSizePx,
  type PaperSize,
} from "@/lib/paper";
import {
  DEFAULT_FONT,
  DEFAULT_TYPOGRAPHY,
  fontCssVars,
  typographyCssVars,
  typographyKey,
  typographySummary,
  type PublishFont,
  type PublishTypography,
} from "@/lib/publishType";

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

function computePreviewScale(paper: PaperSize): number {
  if (typeof window === "undefined") return 0.55;
  const { widthPx, heightPx } = paperSizePx(paper);
  // 翻页区：扣侧栏与翻页按钮
  const maxW = Math.min(640, Math.max(220, window.innerWidth - 460));
  const maxH = Math.min(780, Math.max(280, window.innerHeight - 260));
  return Math.min(1, maxW / widthPx, maxH / heightPx);
}

function PageSheet({
  title,
  pageIndex,
  pageCount,
  entries,
  paperTag,
  showLabel,
}: {
  title: string;
  pageIndex: number;
  pageCount: number;
  entries: FlatEntry[];
  paperTag: string;
  showLabel?: boolean;
}) {
  return (
    <div className="publish-page-outer">
      <section className="publish-page">
        <aside className="publish-spine">
          <div className="publish-spine-inner whitespace-pre-line">{title}</div>
          <div className="publish-spine-level">
            第{pageIndex + 1}/{pageCount}页
          </div>
        </aside>
        <div className="publish-frame">
          <div className="publish-body publish-body-paged">
            {entries.map((entry) => (
              <PersonStrip key={`${pageIndex}-${entry.id}`} entry={entry} />
            ))}
          </div>
        </div>
      </section>
      {showLabel ? (
        <div className="publish-page-label no-print">
          第 {pageIndex + 1} / {pageCount} 页 · {paperTag}
        </div>
      ) : null}
    </div>
  );
}

export function PublishSheet({
  data,
  emptyHint,
  paper = DEFAULT_PAPER,
  font = DEFAULT_FONT,
  typography = DEFAULT_TYPOGRAPHY,
}: {
  data: PublishPayload | null;
  emptyHint?: string;
  paper?: PaperSize;
  font?: PublishFont;
  typography?: PublishTypography;
}) {
  const flat = useMemo(() => (data ? flattenEntries(data) : []), [data]);
  const measureRef = useRef<HTMLDivElement>(null);
  const widthProbeRef = useRef<HTMLDivElement>(null);
  const pagesSigRef = useRef("");
  const [pages, setPages] = useState<FlatEntry[][]>([]);
  const [previewScale, setPreviewScale] = useState(0.55);
  const [pageIndex, setPageIndex] = useState(0);
  const paperKey = `${paper.widthMm}x${paper.heightMm}`;
  const typeKey = typographyKey(typography);
  const layoutKey = `${paperKey}_${font.id}_${typeKey}`;

  const rootStyle = useMemo(
    () =>
      ({
        ...paperCssVars(paper, previewScale),
        ...fontCssVars(font),
        ...typographyCssVars(typography),
      }) as CSSProperties,
    [paper, font, typography, previewScale],
  );
  const printCss = useMemo(() => paperPrintCss(paper), [paper]);

  useLayoutEffect(() => {
    const updateScale = () => setPreviewScale(computePreviewScale(paper));
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [paper.widthMm, paper.heightMm]);

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

      // 按真实纸张版心（1:1）装箱，与打印一致
      const pageHeight = box.clientHeight || paperSizePx(paper).heightPx * 0.9;
      const pageEl = probe.closest(".publish-page");
      const spineEl = pageEl?.querySelector(
        ".publish-spine",
      ) as HTMLElement | null;
      const spineW = spineEl
        ? spineEl.getBoundingClientRect().width || 44
        : 44;
      const framePad = 24;
      const fullW = paperSizePx(paper).widthPx;
      let pageWidth = probe.clientWidth || 0;
      if (pageWidth < 80) {
        pageWidth = Math.max(120, fullW - spineW - framePad);
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
      const personWidth =
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))] ||
        sorted[0] ||
        40;

      const next = packPages(
        flat,
        heights,
        personWidth,
        pageWidth,
        pageHeight,
        18,
      );
      const sig = pagesSignature(next);
      if (sig !== pagesSigRef.current) {
        pagesSigRef.current = sig;
        setPages(next);
      }
    };

    const raf = window.requestAnimationFrame(measure);
    let fontTimer: number | undefined;
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) window.requestAnimationFrame(measure);
      });
    } else {
      fontTimer = window.setTimeout(() => {
        if (!cancelled) measure();
      }, 120);
    }
    const onResize = () => {
      window.requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      if (fontTimer) window.clearTimeout(fontTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [flat, layoutKey, paper]);

  const displayPages = pages.length ? pages : flat.length ? [flat] : [];
  const pageCount = Math.max(1, displayPages.length);

  useEffect(() => {
    setPageIndex(0);
  }, [layoutKey, data?.total, data?.subtitle]);

  useEffect(() => {
    setPageIndex((i) => Math.min(i, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  useEffect(() => {
    if (!data || !displayPages.length) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setPageIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        setPageIndex((i) => Math.min(pageCount - 1, i + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setPageIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setPageIndex(pageCount - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, displayPages.length, pageCount]);

  if (!data) {
    return (
      <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-xl border border-dashed border-line bg-soft/50 px-6 py-10 text-center text-sm text-muted">
        {emptyHint ||
          "在左侧选择查询方式并点击查询，即可生成世系表用于打印或另存 PDF。"}
      </div>
    );
  }

  const paperTag = `${paper.label} ${paper.widthMm}×${paper.heightMm}mm`;
  const safeIndex = Math.min(pageIndex, pageCount - 1);
  const currentEntries = displayPages[safeIndex] || [];

  return (
    <div className="publish-root flex min-h-0 flex-1 flex-col" style={rootStyle}>
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {\n${printCss}\n}`,
        }}
      />
      <div className="publish-meta no-print mb-3 shrink-0 text-sm text-muted">
        {data.subtitle} · 共 {data.total} 人 · {pageCount} 页 · {paperTag} ·{" "}
        {font.label} · {typographySummary(typography)}
        <span className="mt-1 block text-xs">
          预览按真实纸张比例缩小；可用左右箭头或底部按钮翻页。打印时请选「边距：无」，纸张选{" "}
          {paper.label}
          {paper.id === "custom"
            ? `（${paper.widthMm}×${paper.heightMm}mm）`
            : ""}
          。
        </span>
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

      {/* 屏显：左右翻页 */}
      <div className="publish-flip no-print flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 sm:gap-3">
          <button
            type="button"
            className="publish-flip-nav shrink-0 rounded-lg border border-line bg-white px-2.5 py-8 text-lg text-ink shadow-sm hover:bg-soft disabled:cursor-not-allowed disabled:opacity-35 sm:px-3"
            disabled={safeIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            aria-label="上一页"
            title="上一页（←）"
          >
            ‹
          </button>

          <div className="publish-flip-stage flex min-w-0 flex-1 flex-col items-center justify-center overflow-auto py-1">
            <PageSheet
              title={data.title}
              pageIndex={safeIndex}
              pageCount={pageCount}
              entries={currentEntries}
              paperTag={paperTag}
              showLabel
            />
          </div>

          <button
            type="button"
            className="publish-flip-nav shrink-0 rounded-lg border border-line bg-white px-2.5 py-8 text-lg text-ink shadow-sm hover:bg-soft disabled:cursor-not-allowed disabled:opacity-35 sm:px-3"
            disabled={safeIndex >= pageCount - 1}
            onClick={() =>
              setPageIndex((i) => Math.min(pageCount - 1, i + 1))
            }
            aria-label="下一页"
            title="下一页（→）"
          >
            ›
          </button>
        </div>

        <div className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-3 pb-1 text-sm">
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-muted hover:bg-soft disabled:opacity-40"
            disabled={safeIndex <= 0}
            onClick={() => setPageIndex(0)}
          >
            首页
          </button>
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-muted hover:bg-soft disabled:opacity-40"
            disabled={safeIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
          >
            上一页
          </button>
          <span className="min-w-[7rem] text-center font-medium text-ink">
            第 {safeIndex + 1} / {pageCount} 页
          </span>
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-muted hover:bg-soft disabled:opacity-40"
            disabled={safeIndex >= pageCount - 1}
            onClick={() =>
              setPageIndex((i) => Math.min(pageCount - 1, i + 1))
            }
          >
            下一页
          </button>
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-muted hover:bg-soft disabled:opacity-40"
            disabled={safeIndex >= pageCount - 1}
            onClick={() => setPageIndex(pageCount - 1)}
          >
            末页
          </button>
        </div>
      </div>

      {/* 打印：全部页（屏上隐藏） */}
      <div className="publish-pages publish-print-stack" aria-hidden>
        {displayPages.map((pageEntries, idx) => (
          <PageSheet
            key={`print-${idx}-${layoutKey}`}
            title={data.title}
            pageIndex={idx}
            pageCount={pageCount}
            entries={pageEntries}
            paperTag={paperTag}
          />
        ))}
      </div>
    </div>
  );
}
