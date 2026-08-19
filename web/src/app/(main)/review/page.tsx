"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChangeRequest,
  OBJECT_TYPE_LABEL,
  OP_LABEL,
  SessionUser,
} from "@/lib/types";
import {
  Button,
  Card,
  FilterBar,
  FilterField,
  Input,
  Label,
  PageHeader,
  StatusPill,
  TableScroll,
  Textarea,
  tableHeadClass,
} from "@/components/ui";

type BatchResult = {
  id: number;
  name: string;
  ok: boolean;
  error?: string;
};

function batchApproveLabel(role: SessionUser["role"] | undefined) {
  if (role === "final") return "批量通过（生效）";
  if (role === "first") return "批量送二审";
  if (role === "second") return "批量送终审";
  return "批量通过";
}

export default function ReviewListPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [batchMsg, setBatchMsg] = useState("");
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const canReview = ["first", "second", "final", "admin"].includes(
    user?.role || "",
  );

  const load = useCallback(async () => {
    if (!canReview) return;
    const sp = new URLSearchParams({
      mode: "review",
      page: String(page),
      pageSize: "20",
    });
    if (q) sp.set("q", q);
    const res = await fetch(`/api/requests?${sp}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "加载失败");
      return;
    }
    setItems(data.items);
    setTotal(data.total);
    setSelected({});
    setRejectOpen(false);
  }, [page, q, canReview]);

  useEffect(() => {
    if (ready && canReview) load();
  }, [load, ready, canReview]);

  const pageIds = useMemo(() => items.map((i) => i.id), [items]);
  const selectedIds = useMemo(
    () => pageIds.filter((id) => selected[id]),
    [pageIds, selected],
  );
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected[id]);

  const pages = Math.max(1, Math.ceil(total / 20));

  async function runBatch(action: "approve" | "reject") {
    if (!selectedIds.length) return;
    if (action === "reject" && !rejectReason.trim()) {
      setError("请填写驳回原因");
      return;
    }
    setBusy(true);
    setError("");
    setBatchMsg("");
    setBatchResults(null);
    try {
      const res = await fetch("/api/requests/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ids: selectedIds,
          reason: action === "reject" ? rejectReason.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批量审核失败");
      const results = (data.results || []) as BatchResult[];
      setBatchResults(results);
      const ok = Number(data.okCount || 0);
      const fail = Number(data.failCount || 0);
      setBatchMsg(
        action === "approve"
          ? `批量通过完成：成功 ${ok} 条${fail ? `，失败 ${fail} 条` : ""}`
          : `批量驳回完成：成功 ${ok} 条${fail ? `，失败 ${fail} 条` : ""}`,
      );
      setRejectOpen(false);
      setRejectReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量审核失败");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className="text-muted">加载中...</div>;
  }

  if (!canReview) {
    return (
      <div>
        <PageHeader title="信息审核" desc="仅一审 / 二审 / 终审 / 管理员可处理。" />
        <Card className="flex min-h-[280px] flex-col items-center justify-center p-10 text-center">
          <div className="font-display text-2xl text-ink">无权限</div>
          <p className="mt-3 max-w-md text-sm text-muted">
            录入员负责发起与修改变更单，不参与审核。请在「我的编修」查看进度。
          </p>
          <Link href="/edit" className="mt-6">
            <Button>前往我的编修</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="信息审核"
        desc="家谱成员、待考成员与派户支共用审流。请看清单据类型，避免录错库。常规路径：一审→二审→终审；终审也可直接审核录入员提交的待审单并生效。"
      />

      <FilterBar
        actions={
          <Button
            onClick={() => {
              setPage(1);
              load();
            }}
          >
            筛选
          </Button>
        }
      >
        <FilterField className="min-w-[14rem] flex-1">
          <Input
            compact
            clearable
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="姓名 / 单号"
          />
        </FilterField>
      </FilterBar>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      {batchMsg ? <p className="mb-3 text-sm text-ink">{batchMsg}</p> : null}
      {batchResults?.some((r) => !r.ok) ? (
        <Card className="mb-3 p-3 text-sm">
          <div className="mb-1 font-medium text-ink">失败明细</div>
          <ul className="space-y-1 text-muted">
            {batchResults
              .filter((r) => !r.ok)
              .map((r) => (
                <li key={r.id}>
                  #{r.id} {r.name}：{r.error || "失败"}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      {rejectOpen ? (
        <Card className="mb-3 space-y-3 p-4">
          <div className="text-sm font-medium text-ink">
            批量驳回已选 {selectedIds.length} 条
          </div>
          <div>
            <Label>驳回原因（必填，将写入每条单据）</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="请说明驳回原因，录入员可见"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={busy || !rejectReason.trim()}
              onClick={() => runBatch("reject")}
            >
              {busy ? "处理中…" : "确认驳回"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setRejectOpen(false);
                setRejectReason("");
              }}
            >
              取消
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm text-muted">
          <span>
            共 {total} 条
            {selectedIds.length ? (
              <span className="ml-2 text-ink">· 已选 {selectedIds.length} 条</span>
            ) : (
              <span className="ml-2">· 勾选后可批量审核</span>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!selectedIds.length || busy}
              onClick={() => {
                if (
                  !window.confirm(
                    `确认对已选 ${selectedIds.length} 条执行「${batchApproveLabel(user?.role)}」？`,
                  )
                ) {
                  return;
                }
                runBatch("approve");
              }}
            >
              {busy ? "处理中…" : batchApproveLabel(user?.role)}
            </Button>
            <Button
              variant="danger"
              disabled={!selectedIds.length || busy}
              onClick={() => {
                setRejectOpen(true);
                setError("");
              }}
            >
              批量驳回
            </Button>
          </div>
        </div>
        <TableScroll>
          <table className="min-w-full text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={allPageSelected}
                    disabled={!pageIds.length || busy}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSelected((prev) => {
                        const next = { ...prev };
                        for (const id of pageIds) {
                          if (on) next[id] = true;
                          else delete next[id];
                        }
                        return next;
                      });
                    }}
                    title="全选本页"
                  />
                </th>
                <th className="px-4 py-3">单号</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">操作</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">提交人</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-line/70">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={Boolean(selected[item.id])}
                      disabled={busy}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setSelected((prev) => {
                          const next = { ...prev };
                          if (on) next[item.id] = true;
                          else delete next[item.id];
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">#{item.id}</td>
                  <td className="px-4 py-3">
                    {OBJECT_TYPE_LABEL[item.objectType] || "家谱成员"}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {(item.payload as { name?: string }).name}
                  </td>
                  <td className="px-4 py-3">{OP_LABEL[item.operation]}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={item.status} />
                  </td>
                  <td className="px-4 py-3">{item.submitterName}</td>
                  <td className="px-4 py-3">
                    <Link
                      className="text-accent hover:underline"
                      href={`/review/${item.id}`}
                    >
                      审核
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-muted">
                    当前没有待审单据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableScroll>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
          <span>
            共 {total} 条 · 第 {page}/{pages} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1 || busy}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
