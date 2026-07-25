"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";
import type { AdmitPreviewItem } from "@/lib/daikao";

type ResultRow = {
  id: number;
  name: string;
  ok: boolean;
  requestId?: number;
  error?: string;
};

export function DaikaoBatchAdmitDialog({
  open,
  ids,
  onClose,
  onDone,
}: {
  open: boolean;
  ids: number[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submit, setSubmit] = useState(false);
  const [items, setItems] = useState<AdmitPreviewItem[]>([]);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [results, setResults] = useState<ResultRow[] | null>(null);

  useEffect(() => {
    if (!open || !ids.length) return;
    setLoading(true);
    setError("");
    setResults(null);
    setPicks({});
    fetch("/api/daikao/admit-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview: true, ids }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "预览失败");
        setItems(d.items || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "预览失败"))
      .finally(() => setLoading(false));
  }, [open, ids]);

  if (!open) return null;

  function rowReady(item: AdmitPreviewItem) {
    if (!item.name?.trim() || !item.group?.trim()) return false;
    if (item.parentMatch === "ambiguous") return Boolean(picks[item.id]);
    // 已入谱/审核中等：preview 会标 ok=false
    if (!item.ok && !item.error?.includes("将按无父")) return false;
    return true;
  }

  const readyCount = items.filter(rowReady).length;
  const blocked = items.filter((i) => !rowReady(i));

  async function commit() {
    if (!readyCount) {
      setError("没有可提交的成员（请处理重名父亲或补全派户支）");
      return;
    }
    const readyIds = items.filter(rowReady).map((i) => i.id);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/daikao/admit-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: readyIds,
          parentIds: picks,
          submit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批量入谱失败");
      setResults(data.results || []);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量入谱失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[6vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-line bg-panel shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="font-display text-lg text-ink">批量申请入谱</div>
            <div className="mt-0.5 text-xs text-muted">
              为选中的未入谱成员创建变更单；父亲重名须先选定后再提交
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

        <div className="space-y-3 px-5 py-4 text-sm">
          {loading ? (
            <div className="text-muted">正在检查选中成员…</div>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}

          {!loading && !results ? (
            <>
              <div className="text-xs text-muted">
                已选 {ids.length} 人 · 可提交{" "}
                <span className="font-medium text-ink">{readyCount}</span> 人
                {blocked.length ? (
                  <span>
                    {" "}
                    · 需处理{" "}
                    <span className="text-amber-800">{blocked.length}</span> 人
                  </span>
                ) : null}
              </div>
              <div className="max-h-[50vh] space-y-2 overflow-auto">
                {items.map((item) => {
                  const ready = rowReady(item);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border px-3 py-2 ${
                        ready
                          ? "border-line bg-panel"
                          : "border-amber-200 bg-amber-50/50"
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-medium">
                          {item.name || `待考 #${item.id}`}
                        </span>
                        <span className="text-xs text-muted">
                          #{item.id}
                          {item.level != null ? ` · ${item.level}世` : ""}
                          {item.group ? ` · ${item.group}` : ""}
                        </span>
                        {ready ? (
                          <span className="text-xs text-ok">可提交</span>
                        ) : (
                          <span className="text-xs text-danger">
                            {item.error || "不可提交"}
                          </span>
                        )}
                      </div>
                      {item.parentName ? (
                        <div className="mt-1 text-xs text-muted">
                          待考父亲：{item.parentName}
                          {item.parentMatch === "unique" && item.parentId
                            ? ` → 正式 #${item.parentId}`
                            : null}
                          {item.parentMatch === "none"
                            ? "（正式库未匹配，将按无父）"
                            : null}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-muted">无父亲记载</div>
                      )}
                      {item.parentMatch === "ambiguous" ? (
                        <div className="mt-2 space-y-1">
                          {item.parentCandidates.map((c) => (
                            <label
                              key={c.id}
                              className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-xs hover:bg-soft ${
                                picks[item.id] === c.id
                                  ? "bg-soft ring-1 ring-accent/40"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                className="mt-0.5 accent-accent"
                                name={`batch-parent-${item.id}`}
                                checked={picks[item.id] === c.id}
                                onChange={() =>
                                  setPicks((prev) => ({
                                    ...prev,
                                    [item.id]: c.id,
                                  }))
                                }
                              />
                              <span>
                                <span className="font-medium text-ink">
                                  {c.name}
                                </span>
                                <span className="text-muted">
                                  {" "}
                                  · ID {c.id}
                                  {c.level != null ? ` · ${c.level}世` : ""}
                                  {c.groupName ? ` · ${c.groupName}` : ""}
                                  {c.parentName ? ` · 父:${c.parentName}` : ""}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={submit}
                  onChange={(e) => setSubmit(e.target.checked)}
                />
                创建后直接提交审核（不勾选则暂存到「我的编修」）
              </label>
            </>
          ) : null}

          {results ? (
            <div className="rounded-lg border border-line">
              <div className="border-b border-line px-3 py-2 text-sm">
                完成：成功{" "}
                <span className="font-medium text-ok">
                  {results.filter((r) => r.ok).length}
                </span>{" "}
                人，失败{" "}
                <span className="font-medium text-danger">
                  {results.filter((r) => !r.ok).length}
                </span>{" "}
                人
              </div>
              <div className="max-h-56 overflow-auto text-xs">
                <table className="min-w-full">
                  <thead className="bg-soft text-muted">
                    <tr>
                      <th className="px-3 py-1.5 text-left">待考ID</th>
                      <th className="px-3 py-1.5 text-left">姓名</th>
                      <th className="px-3 py-1.5 text-left">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} className="border-t border-line/70">
                        <td className="px-3 py-1.5">{r.id}</td>
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
            {results ? "完成" : "取消"}
          </Button>
          {!results ? (
            <Button
              disabled={busy || loading || !readyCount}
              onClick={commit}
            >
              {busy
                ? "提交中…"
                : `确认入谱（${readyCount} 人）`}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
