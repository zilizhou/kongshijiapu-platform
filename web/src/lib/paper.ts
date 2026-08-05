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

export function paperCssVars(paper: PaperSize): Record<string, string> {
  return {
    "--pub-w-mm": String(paper.widthMm),
    "--pub-h-mm": String(paper.heightMm),
  };
}

export function paperPrintCss(paper: PaperSize): string {
  const { widthMm: w, heightMm: h } = paper;
  return `
@page {
  size: ${w}mm ${h}mm;
  margin: 0;
}
.publish-pages {
  width: ${w}mm !important;
}
.publish-page {
  width: ${w}mm !important;
  height: ${h}mm !important;
  max-height: ${h}mm !important;
}
`.trim();
}
