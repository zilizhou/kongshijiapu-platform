"use client";

import {
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
  // 右侧结果区大致可用空间（扣侧栏、页头）
  const maxW = Math.min(720, Math.max(240, window.innerWidth - 380));
  const maxH = Math.min(920, Math.max(320, window.innerHeight - 180));
  return Math.min(1, maxW / widthPx, maxH / heightPx);
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

  if (!data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-line bg-soft/50 px-6 py-10 text-center text-sm text-muted">
        {emptyHint ||
          "在左侧选择查询方式并点击查询，即可生成世系表用于打印或另存 PDF。"}
      </div>
    );
  }

  const displayPages = pages.length ? pages : [flat];
  const paperTag = `${paper.label} ${paper.widthMm}×${paper.heightMm}mm`;

  return (
    <div className="publish-root" style={rootStyle}>
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {\n${printCss}\n}`,
        }}
      />
      <div className="publish-meta no-print mb-3 text-sm text-muted">
        {data.subtitle} · 共 {data.total} 人 · {displayPages.length} 页 ·{" "}
        {paperTag} · {font.label} · {typographySummary(typography)}
        <span className="mt-1 block text-xs">
          预览按真实纸张比例缩小显示；打印时请选「边距：无」，纸张选{" "}
          {paper.label}
          {paper.id === "custom"
            ? `（自定义 ${paper.widthMm}×${paper.heightMm}mm）`
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

      <div className="publish-pages">
        {displayPages.map((pageEntries, pageIndex) => (
          <div
            key={`outer-${pageIndex}-${layoutKey}`}
            className="publish-page-outer"
          >
            <section className="publish-page">
              <aside className="publish-spine">
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
                    <PersonStrip
                      key={`${pageIndex}-${entry.id}`}
                      entry={entry}
                    />
                  ))}
                </div>
              </div>
            </section>
            <div className="publish-page-label no-print">
              第 {pageIndex + 1} / {displayPages.length} 页 · {paperTag}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
