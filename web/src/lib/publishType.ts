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
  /** 书脊栏宽度 rem（横向占宽，不随字号 scale） */
  spineWidthRem: number;
};

export const DEFAULT_TYPOGRAPHY: PublishTypography = {
  scale: 1,
  detailRem: 1.14,
  nameRatio: 1.55,
  spinePx: 14,
  pageRatio: 0.9,
  spineWidthRem: 2.75,
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
const SPINE_WIDTH_MIN = 1.6;
const SPINE_WIDTH_MAX = 5;

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

export function clampSpineWidthRem(n: number): number {
  return Math.round(clamp(n, SPINE_WIDTH_MIN, SPINE_WIDTH_MAX, 2.75) * 100) / 100;
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
    spineWidthRem: clampSpineWidthRem(
      partial.spineWidthRem ?? DEFAULT_TYPOGRAPHY.spineWidthRem,
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
    "--pub-spine-width": `${n.spineWidthRem}rem`,
  };
}

export function typographyKey(t: PublishTypography): string {
  const n = normalizeTypography(t);
  return `${n.scale}_${n.detailRem}_${n.nameRatio}_${n.spinePx}_${n.pageRatio}_${n.spineWidthRem}`;
}

/** 屏幕/打印上的大致像素（1rem≈16px），便于展示「现在多大」 */
export function effectiveTypePx(t: PublishTypography): {
  detail: number;
  name: number;
  spine: number;
} {
  const n = normalizeTypography(t);
  const remPx = 16;
  const detail = Math.round(n.detailRem * n.scale * remPx);
  const name = Math.round(n.detailRem * n.nameRatio * n.scale * remPx);
  const spine = Math.round(n.spinePx * n.scale);
  return { detail, name, spine };
}

export function typographySummary(t: PublishTypography): string {
  const n = normalizeTypography(t);
  const px = effectiveTypePx(n);
  return `整体${Math.round(n.scale * 100)}% · 名≈${px.name}px · 传≈${px.detail}px`;
}

export function matchScalePreset(scale: number): TypeScalePreset {
  const s = clampScale(scale);
  const hit = SCALE_PRESETS.find((p) => Math.abs(p.scale - s) < 0.001);
  return hit ? hit.id : "custom";
}

/** 分项：人话选项（映射到内部 rem / 倍数 / px） */
export const DETAIL_SIZE_PRESETS = [
  { id: "s", label: "偏小", rem: 0.98 },
  { id: "m", label: "标准", rem: 1.14 },
  { id: "l", label: "偏大", rem: 1.28 },
  { id: "xl", label: "更大", rem: 1.4 },
] as const;

export const NAME_SIZE_PRESETS = [
  { id: "s", label: "略大", ratio: 1.3 },
  { id: "m", label: "标准", ratio: 1.55 },
  { id: "l", label: "醒目", ratio: 1.8 },
  { id: "xl", label: "特大", ratio: 2.05 },
] as const;

export const SPINE_SIZE_PRESETS = [
  { id: "s", label: "偏小", px: 12 },
  { id: "m", label: "标准", px: 14 },
  { id: "l", label: "偏大", px: 16 },
  { id: "xl", label: "更大", px: 18 },
] as const;

/** 书脊栏横向宽度（题名竖排区域） */
export const SPINE_WIDTH_PRESETS = [
  { id: "s", label: "偏窄", rem: 2 },
  { id: "m", label: "标准", rem: 2.75 },
  { id: "l", label: "偏宽", rem: 3.5 },
  { id: "xl", label: "更宽", rem: 4.25 },
] as const;

function nearestPresetId<T extends { id: string }>(
  presets: readonly T[],
  pick: (p: T) => number,
  value: number,
): string {
  let best = presets[0].id;
  let bestDiff = Infinity;
  for (const p of presets) {
    const d = Math.abs(pick(p) - value);
    if (d < bestDiff) {
      bestDiff = d;
      best = p.id;
    }
  }
  return best;
}

export function matchDetailPresetId(rem: number): string {
  return nearestPresetId(DETAIL_SIZE_PRESETS, (p) => p.rem, rem);
}

export function matchNamePresetId(ratio: number): string {
  return nearestPresetId(NAME_SIZE_PRESETS, (p) => p.ratio, ratio);
}

export function matchSpinePresetId(px: number): string {
  return nearestPresetId(SPINE_SIZE_PRESETS, (p) => p.px, px);
}

export function matchSpineWidthPresetId(rem: number): string {
  return nearestPresetId(SPINE_WIDTH_PRESETS, (p) => p.rem, rem);
}
