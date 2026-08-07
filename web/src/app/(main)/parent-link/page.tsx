"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ParentLinkActionDialog,
  ParentLinkBatchDialog,
} from "@/components/ParentLinkDialog";
import { PaginationBar } from "@/components/PaginationBar";
import {
  Button,
  Card,
  FilterBar,
  FilterField,
  Input,
  PageHeader,
  Select,
  TableScroll,
  tableHeadClass,
} from "@/components/ui";
import type { ParentLinkRow } from "@/lib/parent-link-queue";
import type { SessionUser } from "@/lib/types";

function dash(v: string | number | null | undefined) {
  if (v == null || String(v).trim() === "") return "-";
  return String(v);
}

function canEditRole(role: string | undefined) {
  return ["editor", "first", "second", "final", "admin"].includes(role || "");
}

export default function ParentLinkPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [parentName, setParentName] = useState("");
  const [level, setLevel] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("pending");
  const [applied, setApplied] = useState({
    name: "",
    parentName: "",
    level: "",
    group: "",
    status: "pending",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [items, setItems] = useState<ParentLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [actionRow, setActionRow] = useState<ParentLinkRow | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const canEdit = canEditRole(user?.role);

  const selectableIds = useMemo(
    () => items.filter((p) => p.status === "pending").map((p) => p.id),
    [items],
  );
  const selectedIds = useMemo(
    () => selectableIds.filter((id) => selected[id]),
    [selectableIds, selected],
  );
  const allPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected[id]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const sp = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (applied.name) sp.set("name", applied.name);
    if (applied.parentName) sp.set("parentName", applied.parentName);
    if (applied.level) sp.set("level", applied.level);
    if (applied.group) sp.set("group", applied.group);
    if (applied.status) sp.set("status", applied.status);
    try {
      const res = await fetch(`/api/parent-link?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查询失败");
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPendingTotal(data.pendingTotal || 0);
      setSelected({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, applied]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function search() {
    setPage(1);
    setApplied({ name, parentName, level, group, status });
  }

  function reset() {
    setName("");
    setParentName("");
    setLevel("");
    setGroup("");
    setStatus("pending");
    setPage(1);
    setApplied({
      name: "",
      parentName: "",
      level: "",
      group: "",
      status: "pending",
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="挂接管理"
        desc={`kongtree1 导入补遗：有谱上父名、无父 ID，待人工挂接。待处理 ${pendingTotal} 条。`}
      />

      <FilterBar
        actions={
          <>
            <Button onClick={search}>查询</Button>
            <Button variant="secondary" onClick={reset}>
              重置
            </Button>
          </>
        }
      >
        <FilterField className="w-28">
          <Input
            compact
            clearable
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="成员姓名"
          />
        </FilterField>
        <FilterField className="w-28">
          <Input
            compact
            clearable
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="谱上父名"
          />
        </FilterField>
        <FilterField className="w-20">
          <Input
            compact
            clearable
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="世代"
          />
        </FilterField>
        <FilterField className="w-36">
          <Input
            compact
            clearable
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="派户支"
          />
        </FilterField>
        <FilterField className="w-28">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">待挂接</option>
            <option value="linked">已挂接</option>
            <option value="skipped">已跳过</option>
            <option value="">全部</option>
          </Select>
        </FilterField>
      </FilterBar>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-stone-600">
            共 {total} 条{loading ? "（加载中…）" : ""}
          </p>
          {canEdit && applied.status === "pending" && (
            <Button
              variant="secondary"
              disabled={!selectedIds.length}
              onClick={() => setBatchOpen(true)}
            >
              批量挂接（唯一匹配）{selectedIds.length ? `(${selectedIds.length})` : ""}
            </Button>
          )}
        </div>

        <TableScroll>
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className={tableHeadClass}>
                {canEdit && applied.status === "pending" && (
                  <th className="w-8 px-2">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setSelected((prev) => {
                          const next = { ...prev };
                          for (const id of selectableIds) next[id] = on;
                          return next;
                        });
                      }}
                    />
                  </th>
                )}
                <th className="px-2">ID</th>
                <th className="px-2">姓名</th>
                <th className="px-2">性别</th>
                <th className="px-2">世代</th>
                <th className="px-2">派户支</th>
                <th className="px-2">谱上父名</th>
                <th className="px-2">当前父ID</th>
                <th className="px-2">状态</th>
                {canEdit && applied.status === "pending" && (
                  <th className="px-2">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-stone-100">
                  {canEdit && applied.status === "pending" && (
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[row.id])}
                        disabled={row.status !== "pending"}
                        onChange={(e) =>
                          setSelected((prev) => ({
                            ...prev,
                            [row.id]: e.target.checked,
                          }))
                        }
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">{row.peopleId}</td>
                  <td className="px-2 py-2">{dash(row.name)}</td>
                  <td className="px-2 py-2">{dash(row.sex)}</td>
                  <td className="px-2 py-2">{dash(row.level)}</td>
                  <td className="max-w-[200px] truncate px-2 py-2" title={row.groupName || ""}>
                    {dash(row.groupName)}
                  </td>
                  <td className="px-2 py-2 font-medium">{dash(row.parentNameText)}</td>
                  <td className="px-2 py-2">
                    {row.currentParentId ? row.currentParentId : "0"}
                  </td>
                  <td className="px-2 py-2">
                    {row.status === "pending" && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                        待挂接
                      </span>
                    )}
                    {row.status === "linked" && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800">
                        已挂接
                      </span>
                    )}
                    {row.status === "skipped" && (
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                        已跳过
                      </span>
                    )}
                  </td>
                  {canEdit && applied.status === "pending" && (
                    <td className="px-2 py-2">
                      <Button
                        variant="secondary"
                        className="text-xs"
                        onClick={() => setActionRow(row)}
                      >
                        挂接
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={canEdit ? 10 : 8}
                    className="px-2 py-8 text-center text-stone-400"
                  >
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>

        <PaginationBar
          page={page}
          totalPages={pages}
          onChange={setPage}
          leading={`共 ${total} 条`}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50]}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </Card>

      <ParentLinkActionDialog
        open={Boolean(actionRow)}
        row={
          actionRow
            ? {
                id: actionRow.id,
                peopleId: actionRow.peopleId,
                name: actionRow.name,
                parentNameText: actionRow.parentNameText,
                level: actionRow.level,
                groupName: actionRow.groupName,
              }
            : null
        }
        onClose={() => setActionRow(null)}
        onDone={load}
      />

      <ParentLinkBatchDialog
        open={batchOpen}
        queueIds={selectedIds}
        onClose={() => setBatchOpen(false)}
        onDone={load}
      />
    </div>
  );
}
