"use client";

import { useMemo, useState } from "react";
import { BranchPicker } from "@/components/BranchPicker";
import { PublishSheet } from "@/components/PublishSheet";
import {
  Button,
  Card,
  FilterField,
  Input,
  Label,
  PageHeader,
  Select,
  TableScroll,
  tableHeadClass,
} from "@/components/ui";
import {
  DEFAULT_PAPER,
  PAPER_PRESETS,
  resolvePaperSize,
  type PaperPresetId,
} from "@/lib/paper";
import type { PublishPayload } from "@/lib/publish";
import {
  clampDetailRem,
  clampNameRatio,
  clampScale,
  clampSpinePx,
  DEFAULT_FONT,
  DEFAULT_TYPOGRAPHY,
  PUBLISH_FONTS,
  SCALE_PRESETS,
  matchScalePreset,
  normalizeTypography,
  resolvePublishFont,
  type PublishFontId,
  type PublishTypography,
} from "@/lib/publishType";
import type { PeopleRow } from "@/lib/types";

type Mode = "person" | "branch";

type NameHit = Pick<
  PeopleRow,
  | "id"
  | "name"
  | "sex"
  | "no"
  | "level"
  | "groupName"
  | "parentName"
  | "address"
  | "birthday"
  | "deathday"
  | "alias"
  | "spouse"
  | "pinyin"
  | "volume"
  | "rank"
>;

type HitFilter = {
  father: string;
  level: string;
  no: string;
  group: string;
  address: string;
  sex: string;
};

const emptyHitFilter: HitFilter = {
  father: "",
  level: "",
  no: "",
  group: "",
  address: "",
  sex: "",
};

function formatGroup(g: string | null | undefined) {
  if (!g) return "-";
  const parts = g
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "-";
  return parts.reverse().join("/");
}

function dash(v: string | null | undefined) {
  return v && String(v).trim() ? String(v) : "-";
}

function includesCI(hay: string | null | undefined, needle: string) {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (hay || "").toLowerCase().includes(n);
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-white">
        <button
          type="button"
          className="px-3 py-2 text-muted hover:bg-soft disabled:opacity-40"
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <input
          className="w-12 border-x border-line py-2 text-center text-sm outline-none"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        <button
          type="button"
          className="px-3 py-2 text-muted hover:bg-soft disabled:opacity-40"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

async function fetchExactNameHits(name: string): Promise<{
  items: NameHit[];
  total: number;
}> {
  const pageSize = 100;
  const all: NameHit[] = [];
  let page = 1;
  let total = 0;

  for (;;) {
    const sp = new URLSearchParams({
      name: name.trim(),
      exactName: "1",
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await fetch(`/api/people?${sp}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "查找失败");
    total = Number(data.total || 0);
    const batch = (data.items || []) as NameHit[];
    all.push(...batch);
    if (all.length >= total || !batch.length || page >= 50) break;
    page += 1;
  }

  return { items: all, total };
}

export default function PublishPage() {
  const [mode, setMode] = useState<Mode>("person");
  const [personName, setPersonName] = useState("");
  const [nameHits, setNameHits] = useState<NameHit[]>([]);
  const [nameTotal, setNameTotal] = useState(0);
  const [searchingName, setSearchingName] = useState(false);
  const [nameSearched, setNameSearched] = useState(false);
  const [hitFilter, setHitFilter] = useState<HitFilter>(emptyHitFilter);
  const [personId, setPersonId] = useState<number | null>(null);
  const [group, setGroup] = useState("");
  const [up, setUp] = useState(3);
  const [down, setDown] = useState(3);
  /** 按派户支：收录人数 */
  const [limitPreset, setLimitPreset] = useState<"100" | "200" | "all" | "custom">(
    "100",
  );
  const [customLimit, setCustomLimit] = useState("400");
  /** 出版物纸张：预设或自定义毫米尺寸（仅影响排版，不重新查库） */
  const [paperPreset, setPaperPreset] = useState<PaperPresetId>("A4");
  const [customPaperW, setCustomPaperW] = useState(String(DEFAULT_PAPER.widthMm));
  const [customPaperH, setCustomPaperH] = useState(String(DEFAULT_PAPER.heightMm));
  /** 出版物字体 */
  const [fontId, setFontId] = useState<PublishFontId>(DEFAULT_FONT.id);
  /** 字号：整体缩放 + 小传/姓名/书脊分项 */
  const [typeScale, setTypeScale] = useState(DEFAULT_TYPOGRAPHY.scale);
  const [customScalePct, setCustomScalePct] = useState("100");
  const [scaleIsCustom, setScaleIsCustom] = useState(false);
  const [detailRem, setDetailRem] = useState(DEFAULT_TYPOGRAPHY.detailRem);
  const [nameRatio, setNameRatio] = useState(DEFAULT_TYPOGRAPHY.nameRatio);
  const [spinePx, setSpinePx] = useState(DEFAULT_TYPOGRAPHY.spinePx);
  const [showTypeDetail, setShowTypeDetail] = useState(false);
  const [data, setData] = useState<PublishPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queried, setQueried] = useState(false);

  const paper = useMemo(
    () => resolvePaperSize(paperPreset, customPaperW, customPaperH),
    [paperPreset, customPaperW, customPaperH],
  );

  const font = useMemo(() => resolvePublishFont(fontId), [fontId]);

  const typography = useMemo(
    (): PublishTypography =>
      normalizeTypography({
        scale: typeScale,
        detailRem,
        nameRatio,
        spinePx,
        pageRatio: DEFAULT_TYPOGRAPHY.pageRatio,
      }),
    [typeScale, detailRem, nameRatio, spinePx],
  );

  const scalePreset = scaleIsCustom ? "custom" : matchScalePreset(typeScale);

  const selected = nameHits.find((h) => h.id === personId) || null;

  const filteredHits = useMemo(() => {
    return nameHits.filter((h) => {
      if (hitFilter.sex && h.sex !== hitFilter.sex) return false;
      if (hitFilter.level.trim()) {
        const lv = Number(hitFilter.level.replace(/\D/g, ""));
        if (Number.isFinite(lv) && h.level !== lv) return false;
      }
      if (!includesCI(h.parentName, hitFilter.father)) return false;
      if (!includesCI(h.no, hitFilter.no)) return false;
      if (
        !includesCI(h.groupName, hitFilter.group) &&
        !includesCI(formatGroup(h.groupName), hitFilter.group)
      ) {
        return false;
      }
      if (!includesCI(h.address, hitFilter.address)) return false;
      return true;
    });
  }, [nameHits, hitFilter]);

  /** 查找后、尚未生成出版稿时，在右侧展示同名候选表 */
  const showNamePicker =
    mode === "person" && nameSearched && nameHits.length > 0 && !data && !queried;

  function resolveLimit(): string {
    if (limitPreset === "all") return "all";
    if (limitPreset === "custom") {
      const n = Number(String(customLimit).replace(/\D/g, ""));
      return String(Math.max(1, n || 100));
    }
    return limitPreset;
  }

  function pickPerson(id: number) {
    setPersonId(id);
    setData(null);
    setQueried(false);
  }

  async function searchSameName() {
    const q = personName.trim();
    if (!q) {
      setError("请输入姓名");
      return;
    }
    setSearchingName(true);
    setError("");
    setNameSearched(true);
    setPersonId(null);
    setHitFilter(emptyHitFilter);
    setData(null);
    setQueried(false);
    try {
      const { items, total } = await fetchExactNameHits(q);
      setNameHits(items);
      setNameTotal(total);
      if (items.length === 1) {
        setPersonId(items[0].id);
      } else if (!items.length) {
        setError(`未找到姓名为「${q}」的成员`);
      }
    } catch (e) {
      setNameHits([]);
      setNameTotal(0);
      setError(e instanceof Error ? e.message : "查找失败");
    } finally {
      setSearchingName(false);
    }
  }

  async function runQuery() {
    setLoading(true);
    setError("");
    setQueried(true);
    try {
      const sp = new URLSearchParams({ mode });
      if (mode === "person") {
        if (!personId) throw new Error("请先查找并选择一位同名成员");
        sp.set("personId", String(personId));
        sp.set("up", String(up));
        sp.set("down", String(down));
      } else {
        if (!group.trim()) throw new Error("请选择派户支");
        sp.set("group", group.trim());
        sp.set("limit", resolveLimit());
      }
      const res = await fetch(`/api/publish?${sp}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "查询失败");
      setData(json as PublishPayload);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPersonName("");
    setNameHits([]);
    setNameTotal(0);
    setNameSearched(false);
    setHitFilter(emptyHitFilter);
    setPersonId(null);
    setGroup("");
    setUp(3);
    setDown(3);
    setLimitPreset("100");
    setCustomLimit("400");
    setPaperPreset("A4");
    setCustomPaperW(String(DEFAULT_PAPER.widthMm));
    setCustomPaperH(String(DEFAULT_PAPER.heightMm));
    setFontId(DEFAULT_FONT.id);
    setTypeScale(DEFAULT_TYPOGRAPHY.scale);
    setCustomScalePct("100");
    setScaleIsCustom(false);
    setDetailRem(DEFAULT_TYPOGRAPHY.detailRem);
    setNameRatio(DEFAULT_TYPOGRAPHY.nameRatio);
    setSpinePx(DEFAULT_TYPOGRAPHY.spinePx);
    setShowTypeDetail(false);
    setData(null);
    setError("");
    setQueried(false);
  }

  return (
    <div>
      <div className="publish-page-header no-print">
        <PageHeader
          title="家谱出版"
          desc="按人物或派户支生成传统竖排世系表，可选纸张、字体与字号，再打印或另存 PDF。"
          actions={
            data ? (
              <Button
                onClick={() => {
                  const prev = document.title;
                  // 尽量减少浏览器页眉里的站点标题
                  document.title = " ";
                  const restore = () => {
                    document.title = prev;
                    window.removeEventListener("afterprint", restore);
                  };
                  window.addEventListener("afterprint", restore);
                  window.print();
                  // 部分浏览器不触发 afterprint，稍后还原
                  window.setTimeout(restore, 1000);
                }}
                disabled={loading}
              >
                打印 / 另存 PDF
              </Button>
            ) : null
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="publish-query-panel no-print h-fit space-y-4 p-5">
          <div className="font-display text-lg text-ink">查询条件</div>

          <div className="inline-flex overflow-hidden rounded-lg border border-line text-sm">
            <button
              type="button"
              className={`px-4 py-2 ${
                mode === "person"
                  ? "bg-[#5b8fd9] text-white"
                  : "bg-white text-muted hover:bg-soft"
              }`}
              onClick={() => {
                setMode("person");
                setData(null);
                setQueried(false);
              }}
            >
              按人物
            </button>
            <button
              type="button"
              className={`px-4 py-2 ${
                mode === "branch"
                  ? "bg-[#3d8f6a] text-white"
                  : "bg-white text-muted hover:bg-soft"
              }`}
              onClick={() => {
                setMode("branch");
                setData(null);
                setQueried(false);
              }}
            >
              按派户支
            </button>
          </div>

          {mode === "person" ? (
            <>
              <div>
                <Label>
                  <span className="text-accent">*</span> 姓名
                </Label>
                <div className="flex gap-2">
                  <Input
                    clearable
                    value={personName}
                    placeholder="输入姓名，查找全部同名"
                    onChange={(e) => {
                      setPersonName(e.target.value);
                      setNameSearched(false);
                      setNameHits([]);
                      setNameTotal(0);
                      setHitFilter(emptyHitFilter);
                      setPersonId(null);
                      setData(null);
                      setQueried(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void searchSameName();
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    disabled={searchingName || loading}
                    onClick={() => void searchSameName()}
                  >
                    {searchingName ? "查找中…" : "查找"}
                  </Button>
                </div>
                {!nameSearched ? (
                  <p className="mt-1.5 text-xs text-muted">
                    查找后在右侧表格中筛选并选定一人。
                  </p>
                ) : nameTotal > 0 ? (
                  <p className="mt-1.5 text-xs text-muted">
                    共 {nameTotal} 人同名
                    {nameHits.length < nameTotal
                      ? `（已载入 ${nameHits.length}）`
                      : ""}
                    ，请在右侧选定。
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted">无同名结果</p>
                )}
              </div>

              {selected ? (
                <div className="rounded-lg border border-[#5b8fd9]/40 bg-[#5b8fd9]/5 px-3 py-2.5 text-sm">
                  <div className="mb-1 text-xs text-muted">已选成员</div>
                  <div className="font-medium text-ink">
                    {selected.name}
                    <span className="ml-1.5 font-normal text-muted">
                      {selected.sex}
                      {selected.level != null ? ` · 第${selected.level}世` : ""}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs leading-relaxed text-muted">
                    <div>谱号 {dash(selected.no)} · ID {selected.id}</div>
                    <div>父：{dash(selected.parentName)}</div>
                    <div className="break-all">
                      {formatGroup(selected.groupName)}
                    </div>
                    {selected.address ? (
                      <div className="break-all">{selected.address}</div>
                    ) : null}
                  </div>
                  {data || queried ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-[#5b8fd9] hover:underline"
                      onClick={() => {
                        setData(null);
                        setQueried(false);
                      }}
                    >
                      返回同名列表重选
                    </button>
                  ) : null}
                </div>
              ) : nameSearched && nameHits.length > 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-soft/50 px-3 py-2 text-xs text-muted">
                  尚未选定。可在右侧用父亲、世次、谱号、派户支等缩小范围后点选一行。
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Stepper
                  label="向上代数"
                  value={up}
                  min={0}
                  max={10}
                  onChange={setUp}
                />
                <Stepper
                  label="向下代数"
                  value={down}
                  min={0}
                  max={10}
                  onChange={setDown}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>
                  <span className="text-accent">*</span> 派户支
                </Label>
                <BranchPicker
                  value={group}
                  placeholder="派户支（可只填户名模糊匹配）"
                  onChange={setGroup}
                  allowFuzzyText
                />
              </div>
              <div>
                <Label>收录人数</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["100", "100人"],
                      ["200", "200人"],
                      ["all", "全部"],
                      ["custom", "自定义"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        limitPreset === key
                          ? "border-[#3d8f6a] bg-[#3d8f6a] text-white"
                          : "border-line bg-white text-muted hover:bg-soft"
                      }`}
                      onClick={() => setLimitPreset(key)}
                    >
                      {label}
                    </button>
                  ))}
                  {limitPreset === "custom" ? (
                    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1">
                      <input
                        className="w-16 bg-transparent text-center text-sm outline-none"
                        value={customLimit}
                        inputMode="numeric"
                        onChange={(e) =>
                          setCustomLimit(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="400"
                      />
                      <span className="text-xs text-muted">人</span>
                    </div>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  大派户支可选「全部」收录匹配成员；人数很多时生成与打印会较慢，请按需选择。
                </p>
              </div>
            </>
          )}

          <div>
            <Label>纸张</Label>
            <div className="flex flex-wrap items-center gap-2">
              {PAPER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    paperPreset === p.id
                      ? "border-[#5b8fd9] bg-[#5b8fd9] text-white"
                      : "border-line bg-white text-muted hover:bg-soft"
                  }`}
                  onClick={() => setPaperPreset(p.id)}
                  title={`${p.widthMm}×${p.heightMm}mm`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  paperPreset === "custom"
                    ? "border-[#5b8fd9] bg-[#5b8fd9] text-white"
                    : "border-line bg-white text-muted hover:bg-soft"
                }`}
                onClick={() => setPaperPreset("custom")}
              >
                自定义
              </button>
            </div>
            {paperPreset === "custom" ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1">
                  <span className="text-xs text-muted">宽</span>
                  <input
                    className="w-14 bg-transparent text-center outline-none"
                    value={customPaperW}
                    inputMode="numeric"
                    onChange={(e) =>
                      setCustomPaperW(e.target.value.replace(/\D/g, ""))
                    }
                  />
                  <span className="text-xs text-muted">mm</span>
                </div>
                <span className="text-muted">×</span>
                <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1">
                  <span className="text-xs text-muted">高</span>
                  <input
                    className="w-14 bg-transparent text-center outline-none"
                    value={customPaperH}
                    inputMode="numeric"
                    onChange={(e) =>
                      setCustomPaperH(e.target.value.replace(/\D/g, ""))
                    }
                  />
                  <span className="text-xs text-muted">mm</span>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                {paper.widthMm}×{paper.heightMm}mm · 竖版 · 切换后预览与分页即时调整
              </p>
            )}
            {paperPreset === "custom" ? (
              <p className="mt-1.5 text-xs text-muted">
                范围 80–420mm · 当前 {paper.widthMm}×{paper.heightMm}mm（竖版）
              </p>
            ) : null}
          </div>

          <div>
            <Label>字体</Label>
            <div className="flex flex-wrap items-center gap-2">
              {PUBLISH_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  title={f.hint}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    fontId === f.id
                      ? "border-[#5b8fd9] bg-[#5b8fd9] text-white"
                      : "border-line bg-white text-muted hover:bg-soft"
                  }`}
                  style={{ fontFamily: f.family }}
                  onClick={() => setFontId(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {font.hint} · 实际显示取决于本机是否安装对应字体
            </p>
          </div>

          <div>
            <Label>字号</Label>
            <div className="flex flex-wrap items-center gap-2">
              {SCALE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    scalePreset === p.id
                      ? "border-[#5b8fd9] bg-[#5b8fd9] text-white"
                      : "border-line bg-white text-muted hover:bg-soft"
                  }`}
                  onClick={() => {
                    setScaleIsCustom(false);
                    setTypeScale(p.scale);
                    setCustomScalePct(String(Math.round(p.scale * 100)));
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  scalePreset === "custom"
                    ? "border-[#5b8fd9] bg-[#5b8fd9] text-white"
                    : "border-line bg-white text-muted hover:bg-soft"
                }`}
                onClick={() => {
                  setScaleIsCustom(true);
                  setCustomScalePct(String(Math.round(typeScale * 100)));
                }}
              >
                自定义
              </button>
              {scalePreset === "custom" ? (
                <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1">
                  <input
                    className="w-12 bg-transparent text-center text-sm outline-none"
                    value={customScalePct}
                    inputMode="numeric"
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setCustomScalePct(raw);
                      if (raw) setTypeScale(clampScale(Number(raw) / 100));
                    }}
                  />
                  <span className="text-xs text-muted">%</span>
                </div>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              整体 {Math.round(typeScale * 100)}% · 姓名、小传、书脊一并缩放
            </p>
            <button
              type="button"
              className="mt-1.5 text-xs text-[#5b8fd9] hover:underline"
              onClick={() => setShowTypeDetail((v) => !v)}
            >
              {showTypeDetail ? "收起分项调节" : "分项调节（小传 / 姓名 / 书脊）"}
            </button>
            {showTypeDetail ? (
              <div className="mt-2 space-y-2 rounded-lg border border-line bg-soft/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">小传基准</span>
                  <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1">
                    <input
                      className="w-14 bg-transparent text-center outline-none"
                      value={String(detailRem)}
                      inputMode="decimal"
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, "");
                        if (!v) return;
                        setDetailRem(clampDetailRem(Number(v)));
                      }}
                    />
                    <span className="text-xs text-muted">rem</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">姓名 / 小传</span>
                  <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1">
                    <span className="text-xs text-muted">×</span>
                    <input
                      className="w-14 bg-transparent text-center outline-none"
                      value={String(nameRatio)}
                      inputMode="decimal"
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, "");
                        if (!v) return;
                        setNameRatio(clampNameRatio(Number(v)));
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">书脊标题</span>
                  <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1">
                    <input
                      className="w-12 bg-transparent text-center outline-none"
                      value={String(spinePx)}
                      inputMode="numeric"
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        if (!v) return;
                        setSpinePx(clampSpinePx(Number(v)));
                      }}
                    />
                    <span className="text-xs text-muted">px</span>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  生效：小传 {typography.detailRem}rem×{Math.round(typography.scale * 100)}%，
                  姓名约 {(typography.detailRem * typography.nameRatio * typography.scale).toFixed(2)}rem，
                  书脊 {Math.round(typography.spinePx * typography.scale)}px
                </p>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-ink hover:underline"
                  onClick={() => {
                    setDetailRem(DEFAULT_TYPOGRAPHY.detailRem);
                    setNameRatio(DEFAULT_TYPOGRAPHY.nameRatio);
                    setSpinePx(DEFAULT_TYPOGRAPHY.spinePx);
                  }}
                >
                  分项恢复默认
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              disabled={
                loading ||
                searchingName ||
                (mode === "person" && !personId)
              }
              onClick={() => void runQuery()}
            >
              {loading ? "生成中…" : "生成出版"}
            </Button>
            <Button variant="secondary" disabled={loading} onClick={reset}>
              重置
            </Button>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </Card>

        <Card className="publish-result-card overflow-hidden p-5">
          {showNamePicker ? (
            <div className="no-print space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="font-display text-lg text-ink">
                    同名「{personName.trim()}」候选
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    共 {nameTotal} 人
                    {filteredHits.length !== nameHits.length
                      ? ` · 筛选后 ${filteredHits.length} 人`
                      : ""}
                    {selected ? ` · 已选 ID ${selected.id}` : " · 点击一行选定"}
                  </p>
                </div>
                {(hitFilter.father ||
                  hitFilter.level ||
                  hitFilter.no ||
                  hitFilter.group ||
                  hitFilter.address ||
                  hitFilter.sex) && (
                  <button
                    type="button"
                    className="text-xs text-[#5b8fd9] hover:underline"
                    onClick={() => setHitFilter(emptyHitFilter)}
                  >
                    清空筛选
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-soft/40 px-3 py-2">
                <FilterField className="w-28">
                  <Input
                    compact
                    clearable
                    value={hitFilter.father}
                    onChange={(e) =>
                      setHitFilter((f) => ({ ...f, father: e.target.value }))
                    }
                    placeholder="父亲姓名"
                  />
                </FilterField>
                <FilterField className="w-20">
                  <Input
                    compact
                    clearable
                    value={hitFilter.level}
                    onChange={(e) =>
                      setHitFilter((f) => ({ ...f, level: e.target.value }))
                    }
                    placeholder="世次"
                  />
                </FilterField>
                <FilterField className="w-28">
                  <Input
                    compact
                    clearable
                    value={hitFilter.no}
                    onChange={(e) =>
                      setHitFilter((f) => ({ ...f, no: e.target.value }))
                    }
                    placeholder="谱号"
                  />
                </FilterField>
                <FilterField className="w-40">
                  <Input
                    compact
                    clearable
                    value={hitFilter.group}
                    onChange={(e) =>
                      setHitFilter((f) => ({ ...f, group: e.target.value }))
                    }
                    placeholder="派户支"
                  />
                </FilterField>
                <FilterField className="w-36">
                  <Input
                    compact
                    clearable
                    value={hitFilter.address}
                    onChange={(e) =>
                      setHitFilter((f) => ({ ...f, address: e.target.value }))
                    }
                    placeholder="住址"
                  />
                </FilterField>
                <FilterField className="w-24">
                  <Select
                    compact
                    value={hitFilter.sex}
                    onChange={(e) =>
                      setHitFilter((f) => ({ ...f, sex: e.target.value }))
                    }
                  >
                    <option value="">性别</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </Select>
                </FilterField>
              </div>

              <TableScroll className="max-h-[min(68vh,calc(100vh-260px))] rounded-lg border border-line">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="w-10 px-2 py-2.5 text-center font-medium">
                        选
                      </th>
                      <th className="w-12 px-2 py-2.5 font-medium">#</th>
                      <th className="px-3 py-2.5 font-medium">姓名</th>
                      <th className="px-2 py-2.5 font-medium">性别</th>
                      <th className="px-2 py-2.5 font-medium">世次</th>
                      <th className="px-3 py-2.5 font-medium">谱号</th>
                      <th className="px-3 py-2.5 font-medium">父亲</th>
                      <th className="px-3 py-2.5 font-medium">派户支</th>
                      <th className="px-3 py-2.5 font-medium">生卒</th>
                      <th className="px-3 py-2.5 font-medium">住址</th>
                      <th className="px-3 py-2.5 font-medium">配偶</th>
                      <th className="px-3 py-2.5 font-medium">别名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHits.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-10 text-center text-muted"
                          colSpan={12}
                        >
                          当前筛选无匹配，请调整筛选条件
                        </td>
                      </tr>
                    ) : (
                      filteredHits.map((h, idx) => {
                        const active = personId === h.id;
                        const life =
                          h.birthday || h.deathday
                            ? `${dash(h.birthday)}～${dash(h.deathday)}`
                            : "-";
                        return (
                          <tr
                            key={h.id}
                            className={`cursor-pointer border-t border-line/70 ${
                              active
                                ? "bg-[#e8f1fb] ring-1 ring-inset ring-[#5b8fd9]/40"
                                : "hover:bg-soft/50"
                            }`}
                            onClick={() => pickPerson(h.id)}
                          >
                            <td className="px-2 py-2.5 text-center">
                              <input
                                type="radio"
                                className="accent-[#5b8fd9]"
                                name="publish-person"
                                checked={active}
                                onChange={() => pickPerson(h.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td className="px-2 py-2.5 text-muted">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-medium text-ink">
                              {h.name}
                              {h.rank ? (
                                <span className="ml-1 text-xs font-normal text-muted">
                                  {h.rank}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-2.5">{h.sex}</td>
                            <td className="px-2 py-2.5">
                              {h.level != null ? h.level : "-"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                              {dash(h.no)}
                            </td>
                            <td className="px-3 py-2.5">
                              {dash(h.parentName)}
                            </td>
                            <td
                              className="max-w-[200px] truncate px-3 py-2.5"
                              title={formatGroup(h.groupName)}
                            >
                              {formatGroup(h.groupName)}
                            </td>
                            <td
                              className="max-w-[140px] truncate whitespace-nowrap px-3 py-2.5 text-xs text-muted"
                              title={life}
                            >
                              {life}
                            </td>
                            <td
                              className="max-w-[140px] truncate px-3 py-2.5"
                              title={h.address || undefined}
                            >
                              {dash(h.address)}
                            </td>
                            <td className="max-w-[100px] truncate px-3 py-2.5">
                              {dash(h.spouse)}
                            </td>
                            <td
                              className="max-w-[100px] truncate px-3 py-2.5 text-muted"
                              title={h.alias || undefined}
                            >
                              {dash(h.alias)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </TableScroll>

              {selected ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-soft px-3 py-2 text-sm">
                  <span className="text-muted">
                    已选：
                    <span className="font-medium text-ink">
                      {selected.name}
                    </span>
                    {selected.level != null
                      ? ` · 第${selected.level}世`
                      : ""}
                    {selected.parentName
                      ? ` · 父 ${selected.parentName}`
                      : ""}
                  </span>
                  <Button
                    disabled={loading}
                    onClick={() => void runQuery()}
                  >
                    {loading ? "生成中…" : "用此人生成出版"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : !queried && !data ? (
            <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:items-center">
              <div
                className="mx-auto aspect-[3/4] w-full max-w-[200px] rounded-lg border border-[#e2d4bf] p-3 shadow-card"
                style={{ background: "#f7f0e2" }}
                aria-hidden
              >
                <div className="flex h-full border-[3px] border-double border-[#c45c4a]/80">
                  <div
                    className="w-7 border-r-[3px] border-double border-[#c45c4a]/80 px-1 py-2 text-center font-display text-[11px] tracking-widest text-[#2a1f18]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    版式示意
                  </div>
                  <div
                    className="flex flex-1 justify-end gap-0 p-2 font-display text-[#2a1f18]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {["令平", "令虎", "令美"].map((n) => (
                      <div
                        key={n}
                        className="flex w-8 flex-col items-center border-l border-[#c45c4a]/50 px-0.5 text-[13px]"
                      >
                        <div className="text-[15px] font-semibold leading-tight">
                          {n}
                        </div>
                        <div className="mt-1 flex-1 text-[9px] leading-snug opacity-70">
                          一九六五年生妻氏…
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="font-display text-xl text-ink">家谱出版</div>
                <p className="text-muted">
                  在左方面板选择查询方式，即可生成世系表用于打印或下载 PDF。
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 rounded bg-[#5b8fd9] px-2 py-0.5 text-xs text-white">
                      按人物查询
                    </span>
                    <span className="text-muted">
                      输入姓名后在右侧表格筛选同名，选定后再设向上 / 向下代数
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 rounded bg-[#3d8f6a] px-2 py-0.5 text-xs text-white">
                      按派户支查询
                    </span>
                    <span className="text-muted">
                      选择一个派户支，生成分支成员的世系表
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 rounded bg-[#6b7a90] px-2 py-0.5 text-xs text-white">
                      打印
                    </span>
                    <span className="text-muted">
                      调用浏览器打印，可另存为 PDF
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <PublishSheet
              data={data}
              paper={paper}
              font={font}
              typography={typography}
              emptyHint={loading ? "正在生成版式…" : "无结果"}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
