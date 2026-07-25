"use client";

import { useState } from "react";
import { BranchPicker } from "@/components/BranchPicker";
import { PersonPicker } from "@/components/PersonPicker";
import { PublishSheet } from "@/components/PublishSheet";
import { Button, Card, Label, PageHeader } from "@/components/ui";
import type { PublishPayload } from "@/lib/publish";

type Mode = "person" | "branch";

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

export default function PublishPage() {
  const [mode, setMode] = useState<Mode>("person");
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

  function resolveLimit(): string {
    if (limitPreset === "all") return "all";
    if (limitPreset === "custom") {
      const n = Number(String(customLimit).replace(/\D/g, ""));
      return String(Math.max(1, Math.min(20000, n || 100)));
    }
    return limitPreset;
  }

  async function runQuery() {
    setLoading(true);
    setError("");
    setQueried(true);
    try {
      const sp = new URLSearchParams({ mode });
      if (mode === "person") {
        if (!personId) throw new Error("请选择起始人物");
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

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
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
                  <span className="text-accent">*</span> 起始人物
                </Label>
                <PersonPicker
                  valueId={personId}
                  placeholder="输入姓名搜索"
                  onChange={setPersonId}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stepper label="向上代数" value={up} min={0} max={10} onChange={setUp} />
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
                  placeholder="选择或搜索派户支"
                  onChange={setGroup}
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
                  大派户支人数可能上万，「全部」单次最多收录 2 万人，按世次与谱序截取。
                </p>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button disabled={loading} onClick={runQuery}>
              {loading ? "生成中…" : "查询"}
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
                      选择一位成员作为起点，设置向上向下代数
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
