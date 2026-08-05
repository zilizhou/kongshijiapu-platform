/** 出版物纸张（竖版：宽 × 高，单位 mm） */

export type PaperPresetId = "A4" | "A5" | "B5" | "16K" | "custom";

export type PaperSize = {
  id: PaperPresetId;
  label: string;
  /** 宽度 mm（短边，竖版） */
  widthMm: number;
  /** 高度 mm（长边，竖版） */
  heightMm: number;
};

export const PAPER_PRESETS: readonly PaperSize[] = [
  { id: "A4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "A5", label: "A5", widthMm: 148, heightMm: 210 },
  { id: "B5", label: "B5", widthMm: 176, heightMm: 250 },
  { id: "16K", label: "16开", widthMm: 185, heightMm: 260 },
] as const;

export const DEFAULT_PAPER: PaperSize = PAPER_PRESETS[0];

const MM_MIN = 80;
const MM_MAX = 420;

/** CSS 参考像素：与浏览器打印 96dpi 一致，保证装箱与成纸对齐 */
export const CSS_PX_PER_MM = 96 / 25.4;

export function paperSizePx(paper: PaperSize): { widthPx: number; heightPx: number } {
  return {
    widthPx: Math.round(paper.widthMm * CSS_PX_PER_MM * 100) / 100,
    heightPx: Math.round(paper.heightMm * CSS_PX_PER_MM * 100) / 100,
  };
}

export function clampPaperMm(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PAPER.widthMm;
  return Math.min(MM_MAX, Math.max(MM_MIN, Math.round(n)));
}

export function resolvePaperSize(
  preset: PaperPresetId,
  customW?: number | string,
  customH?: number | string,
): PaperSize {
  if (preset === "custom") {
    const widthMm = clampPaperMm(Number(customW));
    const heightMm = clampPaperMm(Number(customH));
    return {
      id: "custom",
      label: `自定义 ${widthMm}×${heightMm}mm`,
      widthMm,
      heightMm,
    };
  }
  return PAPER_PRESETS.find((p) => p.id === preset) || DEFAULT_PAPER;
}

export function paperCssVars(
  paper: PaperSize,
  previewScale = 1,
): Record<string, string> {
  const { widthPx, heightPx } = paperSizePx(paper);
  const scale = Math.min(1, Math.max(0.2, previewScale));
  return {
    "--pub-w-mm": String(paper.widthMm),
    "--pub-h-mm": String(paper.heightMm),
    "--pub-page-w": `${widthPx}px`,
    "--pub-page-h": `${heightPx}px`,
    "--pub-preview-scale": String(scale),
  };
}

/** 打印：固定纸张 + 强制分页，避免 absolute 导致预览拼成一长条 */
export function paperPrintCss(paper: PaperSize): string {
  const { widthMm: w, heightMm: h } = paper;
  return `
@page {
  size: ${w}mm ${h}mm;
  margin: 0 !important;
}
html, body {
  width: ${w}mm !important;
  margin: 0 !important;
  padding: 0 !important;
}
.publish-root {
  --pub-w-mm: ${w};
  --pub-h-mm: ${h};
  --pub-page-w: ${w}mm;
  --pub-page-h: ${h}mm;
  --pub-preview-scale: 1;
}
.publish-pages,
.publish-print-stack {
  position: static !important;
  left: auto !important;
  top: auto !important;
  display: block !important;
  width: ${w}mm !important;
  height: auto !important;
  gap: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  align-items: stretch !important;
  pointer-events: auto !important;
}
.publish-page,
.publish-page-outer {
  position: relative !important;
  box-sizing: border-box !important;
  width: ${w}mm !important;
  height: ${h}mm !important;
  min-width: ${w}mm !important;
  min-height: ${h}mm !important;
  max-width: ${w}mm !important;
  max-height: ${h}mm !important;
  margin: 0 !important;
  transform: none !important;
  overflow: hidden !important;
  page-break-after: always !important;
  break-after: page !important;
  page-break-inside: avoid !important;
  break-inside: avoid !important;
}
.publish-page-outer:last-child,
.publish-page:last-child {
  page-break-after: auto !important;
  break-after: auto !important;
}
.publish-page-outer .publish-page {
  width: 100% !important;
  height: 100% !important;
  page-break-after: auto !important;
  break-after: auto !important;
}
`.trim();
}
