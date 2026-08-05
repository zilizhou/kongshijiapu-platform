/** 出版物排版：字体 + 字号（整体缩放 + 小传 / 姓名 / 书脊分项） */

export type PublishFontId =
  | "song"
  | "kaiti"
  | "fangsong"
  | "heiti"
  | "noto";

export type PublishFont = {
  id: PublishFontId;
  label: string;
  /** CSS font-family 栈（按可用性回退） */
  family: string;
  hint: string;
};

/** 预设字体：依赖本机/浏览器已装字体，缺字会落到栈内下一项 */
export const PUBLISH_FONTS: readonly PublishFont[] = [
  {
    id: "song",
    label: "宋体",
    family:
      '"Songti SC", "STSong", "SimSun", "宋体", "Noto Serif SC", serif',
    hint: "传统印刷风格（默认）",
  },
  {
    id: "kaiti",
    label: "楷体",
    family:
      '"Kaiti SC", "STKaiti", "KaiTi", "楷体", "Noto Serif SC", serif',
    hint: "手写楷书感",
  },
  {
    id: "fangsong",
    label: "仿宋",
    family:
      '"STFangsong", "FangSong", "仿宋", "宋体", "Noto Serif SC", serif',
    hint: "公文/谱牒常用",
  },
  {
    id: "heiti",
    label: "黑体",
    family:
      '"Heiti SC", "STHeiti", "SimHei", "黑体", "Noto Sans SC", "PingFang SC", sans-serif',
    hint: "无衬线，屏显清晰",
  },
  {
    id: "noto",
    label: "思源宋",
    family:
      '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif',
    hint: "站点加载的 Noto Serif SC",
  },
] as const;

export const DEFAULT_FONT: PublishFont = PUBLISH_FONTS[0];

export function resolvePublishFont(id: PublishFontId | string): PublishFont {
  return PUBLISH_FONTS.find((f) => f.id === id) || DEFAULT_FONT;
}

export function fontCssVars(font: PublishFont): Record<string, string> {
  return {
    "--pub-font-family": font.family,
  };
}

export type TypeScalePreset =
  | "smaller"
  | "standard"
  | "larger"
  | "xlarge"
  | "custom";

export type PublishTypography = {
  /** 整体缩放 0.7–1.6 */
  scale: number;
  /** 小传基准 rem（乘 scale 后生效） */
  detailRem: number;
  /** 姓名相对小传的倍数 */
  nameRatio: number;
  /** 书脊标题 px（乘 scale 后生效） */
  spinePx: number;
  /** 页码相对书脊的倍数 */
  pageRatio: number;
};

export const DEFAULT_TYPOGRAPHY: PublishTypography = {
  scale: 1,
  detailRem: 1.14,
  nameRatio: 1.55,
  spinePx: 14,
  pageRatio: 0.9,
};

export const SCALE_PRESETS: readonly {
  id: Exclude<TypeScalePreset, "custom">;
  label: string;
  scale: number;
}[] = [
  { id: "smaller", label: "较小", scale: 0.85 },
  { id: "standard", label: "标准", scale: 1 },
  { id: "larger", label: "较大", scale: 1.15 },
  { id: "xlarge", label: "更大", scale: 1.3 },
] as const;

const SCALE_MIN = 0.7;
const SCALE_MAX = 1.6;
const DETAIL_MIN = 0.85;
const DETAIL_MAX = 1.5;
const NAME_RATIO_MIN = 1.2;
const NAME_RATIO_MAX = 2.2;
const SPINE_MIN = 10;
const SPINE_MAX = 22;
const PAGE_RATIO_MIN = 0.75;
const PAGE_RATIO_MAX = 1.2;

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampScale(n: number): number {
  return Math.round(clamp(n, SCALE_MIN, SCALE_MAX, 1) * 100) / 100;
}

export function clampDetailRem(n: number): number {
  return Math.round(clamp(n, DETAIL_MIN, DETAIL_MAX, 1.14) * 100) / 100;
}

export function clampNameRatio(n: number): number {
  return Math.round(clamp(n, NAME_RATIO_MIN, NAME_RATIO_MAX, 1.55) * 100) / 100;
}

export function clampSpinePx(n: number): number {
  return Math.round(clamp(n, SPINE_MIN, SPINE_MAX, 14));
}

export function clampPageRatio(n: number): number {
  return Math.round(clamp(n, PAGE_RATIO_MIN, PAGE_RATIO_MAX, 0.9) * 100) / 100;
}

export function normalizeTypography(
  partial: Partial<PublishTypography>,
): PublishTypography {
  return {
    scale: clampScale(partial.scale ?? DEFAULT_TYPOGRAPHY.scale),
    detailRem: clampDetailRem(
      partial.detailRem ?? DEFAULT_TYPOGRAPHY.detailRem,
    ),
    nameRatio: clampNameRatio(
      partial.nameRatio ?? DEFAULT_TYPOGRAPHY.nameRatio,
    ),
    spinePx: clampSpinePx(partial.spinePx ?? DEFAULT_TYPOGRAPHY.spinePx),
    pageRatio: clampPageRatio(
      partial.pageRatio ?? DEFAULT_TYPOGRAPHY.pageRatio,
    ),
  };
}

export function typographyCssVars(
  t: PublishTypography,
): Record<string, string> {
  const n = normalizeTypography(t);
  return {
    "--pub-scale": String(n.scale),
    "--pub-detail-base": `${n.detailRem}rem`,
    "--pub-name-ratio": String(n.nameRatio),
    "--pub-spine-base": `${n.spinePx}px`,
    "--pub-page-ratio": String(n.pageRatio),
  };
}

export function typographyKey(t: PublishTypography): string {
  const n = normalizeTypography(t);
  return `${n.scale}_${n.detailRem}_${n.nameRatio}_${n.spinePx}_${n.pageRatio}`;
}

export function typographySummary(t: PublishTypography): string {
  const n = normalizeTypography(t);
  const pct = Math.round(n.scale * 100);
  return `字号 ${pct}% · 小传 ${n.detailRem}rem · 姓名 ×${n.nameRatio}`;
}

export function matchScalePreset(scale: number): TypeScalePreset {
  const s = clampScale(scale);
  const hit = SCALE_PRESETS.find((p) => Math.abs(p.scale - s) < 0.001);
  return hit ? hit.id : "custom";
}
