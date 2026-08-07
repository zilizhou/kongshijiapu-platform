"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "./ui";
import type { ParentLinkPreviewItem } from "@/lib/parent-link-queue";

type ResultRow = {
  queueId: number;
  peopleId: number;
  name: string;
  ok: boolean;
  parentId?: number;
  error?: string;
};

export function ParentLinkBatchDialog({
  open,
  queueIds,
  onClose,
  onDone,
}: {
  open: boolean;
  queueIds: number[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ParentLinkPreviewItem[]>([]);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [results, setResults] = useState<ResultRow[] | null>(null);

  useEffect(() => {
    if (!open || !queueIds.length) return;
    setLoading(true);
    setError("");
    setResults(null);
    setPicks({});
    fetch("/api/parent-link/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview: true, ids: queueIds }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "预览失败");
        setItems(d.items || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "预览失败"))
      .finally(() => setLoading(false));
  }, [open, queueIds]);

  if (!open) return null;

  function rowReady(item: ParentLinkPreviewItem) {
    if (item.parentMatch === "ambiguous") return Boolean(picks[item.queueId]);
    return item.ok;
  }

  const readyCount = items.filter(rowReady).length;
  const blocked = items.filter((i) => !rowReady(i));

  async function commit() {
    if (!readyCount) {
      setError("没有可挂接的记录（请处理重名父亲或改用手动挂接）");
      return;
    }
    const ready = items.filter(rowReady);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/parent-link/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: ready.map((i) => i.queueId),
          parentIds: picks,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "提交失败");
      setResults(d.results || []);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">批量挂接预览</h2>
          <p className="mt-1 text-xs text-stone-500">
            仅自动挂接「唯一匹配」的记录；重名须逐条选人；无匹配请用「新建父亲」。
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {loading && <p className="text-sm text-stone-500">加载预览…</p>}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

          {!loading && !results && (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-stone-500">
                  <th className="py-1 pr-2">成员</th>
                  <th className="py-1 pr-2">谱上父名</th>
                  <th className="py-1 pr-2">匹配</th>
                  <th className="py-1">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.queueId} className="border-b border-stone-100">
                    <td className="py-2 pr-2">
                      <div>{item.name}</div>
                      <div className="text-stone-400">ID {item.peopleId}</div>
                    </td>
                    <td className="py-2 pr-2">{item.parentNameText || "-"}</td>
                    <td className="py-2 pr-2">
                      {item.parentMatch === "unique" && (
                        <span className="text-emerald-700">唯一</span>
                      )}
                      {item.parentMatch === "ambiguous" && (
                        <span className="text-amber-700">重名</span>
                      )}
                      {item.parentMatch === "none" && (
                        <span className="text-red-600">无匹配</span>
                      )}
                      {item.error && (
                        <div className="text-stone-500">{item.error}</div>
                      )}
                    </td>
                    <td className="py-2">
                      {item.parentMatch === "unique" && item.parentId && (
                        <span className="text-stone-600">
                          → ID {item.parentId}
                        </span>
                      )}
                      {item.parentMatch === "ambiguous" && (
                        <select
                          className="max-w-[220px] rounded border px-1 py-0.5"
                          value={picks[item.queueId] || ""}
                          onChange={(e) =>
                            setPicks((prev) => ({
                              ...prev,
                              [item.queueId]: Number(e.target.value),
                            }))
                          }
                        >
                          <option value="">选择父亲…</option>
                          {item.parentCandidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {c.level ?? "?"}世 ·{" "}
                              {(c.groupName || "").slice(0, 20)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {results && (
            <div className="space-y-2">
              {results.map((r) => (
                <div
                  key={r.queueId}
                  className={`rounded px-2 py-1 text-sm ${r.ok ? "bg-emerald-50" : "bg-red-50"}`}
                >
                  {r.ok
                    ? `✓ ${r.name} → 父亲 ID ${r.parentId}`
                    : `✗ ${r.name || r.queueId}: ${r.error}`}
                </div>
              ))}
            </div>
          )}

          {!loading && !results && blocked.length > 0 && (
            <p className="mt-3 text-xs text-stone-500">
              可挂接 {readyCount} / {items.length} 条；其余需单独处理。
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {results ? "关闭" : "取消"}
          </Button>
          {!results && (
            <Button onClick={commit} disabled={busy || loading || !readyCount}>
              {busy ? "提交中…" : `确认挂接 (${readyCount})`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

type Candidate = {
  id: number;
  name: string;
  sex: string;
  level: number | null;
  groupName: string | null;
  parentName: string | null;
};

export function ParentLinkActionDialog({
  open,
  row,
  onClose,
  onDone,
}: {
  open: boolean;
  row: {
    id: number;
    peopleId: number;
    name: string;
    parentNameText: string;
    level: number | null;
    groupName: string | null;
  } | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [tab, setTab] = useState<"pick" | "create">("pick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchName, setSearchName] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | "">("");
  const [parentName, setParentName] = useState("");
  const [parentSex, setParentSex] = useState<"男" | "女">("男");
  const [parentLevel, setParentLevel] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    setTab("pick");
    setError("");
    setSearchName(row.parentNameText || "");
    setParentName(row.parentNameText || "");
    setParentSex("男");
    setParentLevel(row.level != null ? String(row.level - 1) : "");
    setSelectedParentId("");
    setCandidates([]);
  }, [open, row]);

  useEffect(() => {
    if (!open || !row || tab !== "pick") return;
    const name = searchName.trim();
    if (!name) {
      setCandidates([]);
      return;
    }
    const sp = new URLSearchParams({
      name,
      childPeopleId: String(row.peopleId),
    });
    fetch(`/api/parent-link/candidates?${sp}`)
      .then((r) => r.json())
      .then((d) => setCandidates(d.items || []))
      .catch(() => setCandidates([]));
  }, [open, row, tab, searchName]);

  if (!open || !row) return null;

  async function linkExisting() {
    if (!selectedParentId) {
      setError("请选择父亲");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/parent-link/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peopleId: row!.peopleId,
          parentId: selectedParentId,
          matchHint: "manual",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "挂接失败");
      onDone?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "挂接失败");
    } finally {
      setBusy(false);
    }
  }

  async function createAndLink() {
    if (!parentName.trim()) {
      setError("父亲姓名不能为空");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/parent-link/create-and-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peopleId: row!.peopleId,
          parent: {
            name: parentName.trim(),
            sex: parentSex,
            level: parentLevel.trim() ? Number(parentLevel) : null,
            group: row!.groupName || "",
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "新建失败");
      onDone?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建失败");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/parent-link/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peopleId: row!.peopleId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "跳过失败");
      onDone?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "跳过失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">挂接父亲</h2>
          <p className="mt-1 text-xs text-stone-500">
            {row.name}（ID {row.peopleId}）· 谱上父名「{row.parentNameText || "-"}」
          </p>
        </div>

        <div className="flex gap-2 border-b px-4 pt-2">
          <button
            type="button"
            className={`rounded-t px-3 py-1.5 text-sm ${tab === "pick" ? "border border-b-0 bg-white font-medium" : "text-stone-500"}`}
            onClick={() => setTab("pick")}
          >
            选择已有父亲
          </button>
          <button
            type="button"
            className={`rounded-t px-3 py-1.5 text-sm ${tab === "create" ? "border border-b-0 bg-white font-medium" : "text-stone-500"}`}
            onClick={() => setTab("create")}
          >
            新建父亲并挂接
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

          {tab === "pick" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-500">搜索父亲姓名</label>
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-auto rounded border">
                {candidates.length === 0 && (
                  <p className="p-2 text-xs text-stone-400">无候选（可切换「新建父亲」）</p>
                )}
                {candidates.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer gap-2 border-b px-2 py-1.5 text-xs hover:bg-stone-50"
                  >
                    <input
                      type="radio"
                      name="parentPick"
                      checked={selectedParentId === c.id}
                      onChange={() => setSelectedParentId(c.id)}
                    />
                    <span>
                      {c.name} · ID {c.id} · {c.level ?? "?"}世
                      <br />
                      <span className="text-stone-400">{c.groupName || "-"}</span>
                    </span>
                  </label>
                ))}
              </div>
              <Link
                href={`/people?id=${row.peopleId}`}
                className="text-xs text-blue-600 hover:underline"
                target="_blank"
              >
                在家谱管理中查看该成员
              </Link>
            </div>
          )}

          {tab === "create" && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-stone-500">
                将在正式库新建父亲节点，并自动挂接到该成员（接管其原父链位置）。
              </p>
              <div>
                <label className="text-xs text-stone-500">父亲姓名</label>
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-stone-500">性别</label>
                  <select
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={parentSex}
                    onChange={(e) => setParentSex(e.target.value as "男" | "女")}
                  >
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-stone-500">世代</label>
                  <input
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={parentLevel}
                    onChange={(e) => setParentLevel(e.target.value)}
                    placeholder="默认子辈-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500">派户支（继承子辈）</label>
                <input
                  className="mt-1 w-full rounded border bg-stone-50 px-2 py-1.5"
                  readOnly
                  value={row.groupName || ""}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 border-t px-4 py-3">
          <Button variant="secondary" onClick={skip} disabled={busy}>
            暂不处理
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              取消
            </Button>
            {tab === "pick" ? (
              <Button onClick={linkExisting} disabled={busy}>
                {busy ? "挂接中…" : "确认挂接"}
              </Button>
            ) : (
              <Button onClick={createAndLink} disabled={busy}>
                {busy ? "创建中…" : "新建并挂接"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
