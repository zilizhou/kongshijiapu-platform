"use client";

import { useState } from "react";
import { BranchPicker } from "@/components/BranchPicker";
import { PublishSheet } from "@/components/PublishSheet";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";
import type { PublishPayload } from "@/lib/publish";
import type { PeopleRow } from "@/lib/types";

type Mode = "person" | "branch";

type NameHit = Pick<
  PeopleRow,
  "id" | "name" | "sex" | "no" | "level" | "groupName" | "parentName" | "address"
>;

function formatGroup(g: string | null | undefined) {
  if (!g) return "-";
  const parts = g
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "-";
  return parts.reverse().join("/");
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
  const [personId, setPersonId] = useState<number | null>(null);
  const [group, setGroup] = useState("");
  const [up, setUp] = useState(3);
  const [down, setDown] = useState(3);
  /** 按派户支：收录人数 */
  const [limitPreset, setLimitPreset] = useState<"100" | "200" | "all" | "custom">(
    "100",
  );
  const [customLimit, setCustomLimit] = useState("400");
  const [data, setData] = useState<PublishPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queried, setQueried] = useState(false);

  const selected = nameHits.find((h) => h.id === personId) || null;

  function resolveLimit(): string {
    if (limitPreset === "all") return "all";
    if (limitPreset === "custom") {
      const n = Number(String(customLimit).replace(/\D/g, ""));
      return String(Math.max(1, n || 100));
    }
    return limitPreset;
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
    setPersonId(null);
    setGroup("");
    setUp(3);
    setDown(3);
    setLimitPreset("100");
    setCustomLimit("400");
    setData(null);
    setError("");
    setQueried(false);
  }

  return (
    <div>
      <div className="publish-page-header no-print">
        <PageHeader
          title="家谱出版"
          desc="按人物或派户支生成传统竖排世系表，可打印或另存为 PDF。"
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

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
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
              </div>

              {nameSearched ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>
                      {nameTotal > 0
                        ? `共 ${nameTotal} 人同名「${personName.trim()}」`
                        : "无同名结果"}
                      {nameHits.length < nameTotal
                        ? `（已载入 ${nameHits.length}）`
                        : ""}
                    </span>
                    {selected ? (
                      <span className="text-accent">已选 ID {selected.id}</span>
                    ) : null}
                  </div>
                  {nameHits.length ? (
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line bg-white p-1.5">
                      {nameHits.map((h) => {
                        const active = personId === h.id;
                        return (
                          <label
                            key={h.id}
                            className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-soft ${
                              active ? "bg-soft ring-1 ring-[#5b8fd9]/50" : ""
                            }`}
                          >
                            <input
                              type="radio"
                              className="mt-0.5 accent-[#5b8fd9]"
                              name="publish-person"
                              checked={active}
                              onChange={() => {
                                setPersonId(h.id);
                                setData(null);
                                setQueried(false);
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-ink">
                                {h.name}
                                <span className="ml-1.5 font-normal text-muted">
                                  {h.sex}
                                  {h.level != null ? ` · 第${h.level}世` : ""}
                                  {h.no ? ` · 谱号 ${h.no}` : ""}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                                父：{h.parentName || "-"}
                                {" · "}
                                {formatGroup(h.groupName)}
                                {h.address ? ` · ${h.address}` : ""}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  先按姓名查找，列出全部同名成员后再选择一人。
                </p>
              )}

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
                  max={6}
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
          {!queried && !data ? (
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
                      输入姓名列出全部同名，选定一人后设置向上 / 向下代数
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
              emptyHint={loading ? "正在生成版式…" : "无结果"}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
