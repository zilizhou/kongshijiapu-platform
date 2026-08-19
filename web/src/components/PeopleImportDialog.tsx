"use client";

import { useRef, useState } from "react";
import { Button } from "./ui";
import type {
  ImportRowResult,
  PendingParentPick,
} from "@/lib/people-import";
import type { PeopleScope } from "@/lib/people-scope";

function formatGroup(g: string | null | undefined) {
  if (!g) return "-";
  const parts = g
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "-";
  return parts.reverse().join("/");
}

function candidateLabel(c: PendingParentPick["candidates"][number]) {
  const parts = [
    `ID ${c.id}`,
    c.level != null ? `${c.level}世` : null,
    formatGroup(c.groupName),
    c.parentName ? `父:${c.parentName}` : null,
    c.address ? c.address.slice(0, 20) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function PeopleImportDialog({
  open,
  onClose,
  onDone,
  scope = "people",
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  scope?: PeopleScope;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submit, setSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingParentPick[]>([]);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [summary, setSummary] = useState<{
    okCount: number;
    failCount: number;
    pendingCount: number;
    results: ImportRowResult[];
  } | null>(null);

  if (!open) return null;

  function resetOutcome() {
    setSummary(null);
    setPending([]);
    setPicks({});
  }

  async function downloadTemplate() {
    setError("");
    try {
      const res = await fetch(
        scope === "daikao"
          ? "/api/daikao/import/template"
          : "/api/people/import/template",
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "下载失败");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        scope === "daikao" ? "待考成员导入模板.xlsx" : "家谱成员导入模板.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败");
    }
  }

  function applyImportResponse(data: {
    okCount?: number;
    failCount?: number;
    pendingCount?: number;
    pending?: PendingParentPick[];
    results?: ImportRowResult[];
  }) {
    const nextPending = data.pending || [];
    setPending(nextPending);
    setPicks({});
    setSummary({
      okCount: data.okCount || 0,
      failCount: data.failCount || 0,
      pendingCount: data.pendingCount || nextPending.length,
      results: data.results || [],
    });
    if (!nextPending.length) {
      onDone?.();
    }
  }

  async function runImport() {
    if (!file) {
      setError("请先选择 Excel 文件");
      return;
    }
    setBusy(true);
    setError("");
    resetOutcome();
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("submit", submit ? "1" : "0");
      const res = await fetch(
        scope === "daikao" ? "/api/daikao/import" : "/api/people/import",
        {
          method: "POST",
          body: fd,
        },
      );
      const data = await res.json();
      if (!res.ok) {
        const detail = data.parseErrors
          ? data.parseErrors
              .map((x: { row: number; error: string }) => `第${x.row}行：${x.error}`)
              .join("；")
          : "";
        throw new Error(detail || data.error || "导入失败");
      }
      applyImportResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function continueWithPicks() {
    const missing = pending.filter((p) => !picks[p.row]);
    if (missing.length) {
      setError(`还有 ${missing.length} 行未选择父亲`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        scope === "daikao" ? "/api/daikao/import" : "/api/people/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submit,
            items: pending.map((p) => ({
              row: p.row,
              payload: p.payload,
              parentId: picks[p.row],
            })),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "确认导入失败");

      // 合并：保留此前已成功的结果，用本次结果替换待选行
      const prevOk = (summary?.results || []).filter((r) => r.ok);
      const mergedMap = new Map<number, ImportRowResult>();
      for (const r of prevOk) mergedMap.set(r.row, r);
      for (const r of data.results || []) mergedMap.set(r.row, r);
      const merged = [...mergedMap.values()].sort((a, b) => a.row - b.row);

      setPending([]);
      setPicks({});
      setSummary({
        okCount: merged.filter((r) => r.ok).length,
        failCount: merged.filter((r) => !r.ok).length,
        pendingCount: 0,
        results: merged,
      });
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认导入失败");
    } finally {
      setBusy(false);
    }
  }

  const hasPending = pending.length > 0;
  const allPicked = hasPending && pending.every((p) => picks[p.row]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[6vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-line bg-panel shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="font-display text-lg text-ink">
              {scope === "daikao" ? "批量导入待考成员" : "批量导入成员"}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {scope === "daikao"
                ? "父亲仅在待考库匹配；成功后进入待考编修/审核，终审写入待考库"
                : "先下载 Excel 模板填写，再上传；成功后进入编修/审核流程（非直接写入正式库）"}
            </div>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-muted hover:bg-soft"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          {!hasPending ? (
            <>
              <div className="rounded-lg bg-soft px-3 py-3 text-xs leading-relaxed text-muted">
                <div className="mb-1 font-medium text-ink">填写说明</div>
                <ul className="list-disc space-y-1 pl-4">
                  <li>必填：姓名、性别（男/女）、所属派户支</li>
                  <li>
                    有父时填「当前父姓名」；若重名，导入后会列出候选人供选择
                  </li>
                  <li>是否出嗣 / 是否源自原始谱书：填「是」或「否」</li>
                  <li>
                    单次最多 200 行；请直接编辑下载的 .xlsx 后上传（勿另存为
                    CSV）
                  </li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={downloadTemplate}>
                  下载导入模板
                </Button>
                <span className="text-xs text-muted">
                  Excel 模板（.xlsx）含表头、说明行与一行示例，可删改后上传
                </span>
              </div>

              <div>
                <div className="mb-1 text-xs text-muted">选择文件</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="block w-full text-sm"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    resetOutcome();
                  }}
                />
                {file ? (
                  <div className="mt-1 text-xs text-muted">已选：{file.name}</div>
                ) : null}
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={submit}
                  onChange={(e) => setSubmit(e.target.checked)}
                />
                导入后直接提交审核（不勾选则暂存到「我的编修」）
              </label>
            </>
          ) : null}

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          {hasPending ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60">
              <div className="border-b border-amber-200 px-3 py-2 text-sm text-ink">
                有{" "}
                <span className="font-medium text-amber-800">
                  {pending.length}
                </span>{" "}
                行父亲重名，请选择真正的父亲后继续导入
                {summary ? (
                  <span className="ml-2 text-xs text-muted">
                    （已成功 {summary.okCount} 行
                    {summary.failCount
                      ? `，其它失败 ${summary.failCount} 行`
                      : ""}
                    ）
                  </span>
                ) : null}
              </div>
              <div className="max-h-[50vh] space-y-3 overflow-auto px-3 py-3">
                {pending.map((p) => (
                  <div
                    key={p.row}
                    className="rounded-lg border border-line bg-panel px-3 py-2"
                  >
                    <div className="mb-1.5 text-sm">
                      第 {p.row} 行 · 成员{" "}
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted">
                        {" "}
                        → 父「{p.parentName}」有 {p.candidateTotal} 人同名
                        {p.candidates.length < p.candidateTotal
                          ? `（下列出前 ${p.candidates.length} 人）`
                          : ""}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {p.candidates.map((c) => (
                        <label
                          key={c.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-soft ${
                            picks[p.row] === c.id ? "bg-soft ring-1 ring-accent/40" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            className="mt-0.5 accent-accent"
                            name={`parent-${p.row}`}
                            checked={picks[p.row] === c.id}
                            onChange={() =>
                              setPicks((prev) => ({ ...prev, [p.row]: c.id }))
                            }
                          />
                          <span>
                            <span className="font-medium text-ink">{c.name}</span>
                            <span className="text-muted">
                              {" "}
                              （{c.sex}） · {candidateLabel(c)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {summary && !hasPending ? (
            <div className="rounded-lg border border-line">
              <div className="border-b border-line px-3 py-2 text-sm">
                完成：成功{" "}
                <span className="font-medium text-ok">{summary.okCount}</span>{" "}
                行，失败{" "}
                <span className="font-medium text-danger">
                  {summary.failCount}
                </span>{" "}
                行
              </div>
              <div className="max-h-56 overflow-auto text-xs">
                <table className="min-w-full">
                  <thead className="bg-soft text-muted">
                    <tr>
                      <th className="px-3 py-1.5 text-left">行</th>
                      <th className="px-3 py-1.5 text-left">姓名</th>
                      <th className="px-3 py-1.5 text-left">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.results.map((r) => (
                      <tr
                        key={`${r.row}-${r.name}`}
                        className="border-t border-line/70"
                      >
                        <td className="px-3 py-1.5">{r.row}</td>
                        <td className="px-3 py-1.5">{r.name || "-"}</td>
                        <td className="px-3 py-1.5">
                          {r.ok ? (
                            <span className="text-ok">
                              成功
                              {r.requestId ? `（变更单 #${r.requestId}）` : ""}
                            </span>
                          ) : (
                            <span className="text-danger">{r.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {summary && !hasPending ? "完成" : "取消"}
          </Button>
          {hasPending ? (
            <Button disabled={busy || !allPicked} onClick={continueWithPicks}>
              {busy ? "导入中…" : "确认所选父亲并继续"}
            </Button>
          ) : !summary ? (
            <Button disabled={busy || !file} onClick={runImport}>
              {busy ? "导入中…" : "开始导入"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
