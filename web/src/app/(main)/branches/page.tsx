"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { BranchForm, emptyBranchPayload } from "@/components/BranchForm";
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
import type { BranchPayload, BranchRow, SessionUser } from "@/lib/types";

function dash(v: string | number | null | undefined) {
  if (v == null || String(v).trim() === "") return "-";
  return String(v);
}

function ActionBtn({
  children,
  className = "",
  onClick,
  href,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
}) {
  const cls = `inline-flex items-center justify-center rounded px-2 py-0.5 text-xs text-white whitespace-nowrap ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

type ParentOpt = { id: number; name: string; fullName: string };

export default function BranchesPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [level, setLevel] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [operable, setOperable] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<BranchRow[]>([]);
  const [parents, setParents] = useState<ParentOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<BranchRow | null>(null);
  const [editItem, setEditItem] = useState<BranchRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<BranchPayload>(emptyBranchPayload());
  const [saving, setSaving] = useState(false);

  const canEdit = user?.role === "editor" || user?.role === "admin";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null));
    fetch("/api/branches?options=1")
      .then((r) => r.json())
      .then((d) => setParents(d.items || []))
      .catch(() => setParents([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const sp = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (name) sp.set("name", name);
    if (parentId) sp.set("parentId", parentId);
    if (level) sp.set("level", level);
    try {
      const res = await fetch(`/api/branches?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查询失败");
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, name, parentId, level]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function resetFilters() {
    setName("");
    setParentId("");
    setLevel("");
    setReviewStatus("");
    setPage(1);
  }

  function openCreate() {
    setCreating(true);
    setEditItem(null);
    setForm(emptyBranchPayload());
  }

  function openEdit(b: BranchRow) {
    setCreating(false);
    setEditItem(b);
    setForm({
      name: b.name,
      fullName: b.fullName,
      parentId: b.parentId,
      book: b.book || "",
      person: b.person || "",
      volume: b.volume || "",
      remark: b.remark || "",
      level: b.level,
      personParentId: b.personParentId,
      personParentName: b.personParentName || "",
      personParentNo: b.personParentNo || "",
    });
  }

  async function saveForm(submit: boolean) {
    if (!form.name.trim()) {
      setError("请填写派户支名称");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectType: "branch",
          operation: editItem ? "update" : "create",
          objectId: editItem?.id ?? null,
          payload: form,
          submit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");
      setEditItem(null);
      setCreating(false);
      await load();
      if (submit) {
        window.alert(
          `已提交审核（变更单 #${data.item?.id}），请在「我的编修」查看进度。`,
        );
      } else {
        window.alert(`已暂存变更单 #${data.item?.id}，可在「我的编修」继续编辑。`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(b: BranchRow) {
    if (
      !window.confirm(
        `确认提交删除派户支「${b.name}」的审核？删除需一审→二审→终审通过后生效。`,
      )
    ) {
      return;
    }
    setError("");
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectType: "branch",
          operation: "delete",
          objectId: b.id,
          payload: {
            name: b.name,
            fullName: b.fullName,
            parentId: b.parentId,
            book: b.book || "",
            person: b.person || "",
            volume: b.volume || "",
            remark: b.remark || "",
            level: b.level,
          },
          submit: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");
      await load();
      window.alert(`已提交删除审核（变更单 #${data.item?.id}）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    }
  }

  const shown = useMemo(() => {
    if (!reviewStatus) return items;
    return items.filter((b) => (b.reviewStatus || "已生效") === reviewStatus);
  }, [items, reviewStatus]);

  return (
    <div>
      <PageHeader
        title="派户支管理"
        desc="新增/修改/删除均提交变更单，经一审→二审→终审通过后生效（与家谱数据一致）。"
        actions={
          canEdit ? (
            <Button onClick={openCreate}>新增派户支</Button>
          ) : undefined
        }
      />

      <FilterBar
        actions={
          <>
            <Button
              onClick={() => {
                setPage(1);
                load();
              }}
            >
              查询
            </Button>
            <Button variant="secondary" onClick={resetFilters}>
              重置
            </Button>
          </>
        }
      >
        <FilterField className="w-40">
          <Input
            compact
            clearable
            value={name}
            placeholder="派户支名称"
            onChange={(e) => setName(e.target.value)}
          />
        </FilterField>
        <FilterField className="w-40">
          <Select
            compact
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">上级派户支</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField className="w-24">
          <Input
            compact
            clearable
            type="number"
            value={level}
            placeholder="世代"
            onChange={(e) => setLevel(e.target.value)}
          />
        </FilterField>
        <FilterField className="w-32">
          <Select
            compact
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value)}
          >
            <option value="">审核状态</option>
            <option value="已生效">已生效</option>
            <option value="暂存">暂存</option>
            <option value="待一审">待一审</option>
            <option value="待二审">待二审</option>
            <option value="待终审">待终审</option>
            <option value="已驳回">已驳回</option>
          </Select>
        </FilterField>
      </FilterBar>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="font-display text-lg text-ink">所有派户支列表</div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 ${
                operable ? "text-ink" : ""
              }`}
              onClick={() => setOperable(true)}
            >
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-[#4a7bbf] bg-white" />
              可操作
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 ${
                !operable ? "text-ink" : ""
              }`}
              onClick={() => setOperable(false)}
            >
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-[#9ca3af] bg-white" />
              仅查看
            </button>
          </div>
        </div>

        <TableScroll>
          <table className="min-w-full text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-3 py-2 font-medium">序号</th>
                <th className="px-3 py-2 font-medium">派户支名称</th>
                <th className="px-3 py-2 font-medium">上级派户支</th>
                <th className="px-3 py-2 font-medium">世代</th>
                <th className="px-3 py-2 font-medium">操作类型</th>
                <th className="px-3 py-2 font-medium">审核状态</th>
                <th className="px-3 py-2 font-medium">创建时间</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    加载中...
                  </td>
                </tr>
              ) : null}
              {!loading && !shown.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    暂无数据
                  </td>
                </tr>
              ) : null}
              {shown.map((b, idx) => {
                const rowOperable = operable && canEdit;
                return (
                  <tr
                    key={b.id}
                    className={`border-t border-line ${
                      rowOperable
                        ? "border-l-2 border-l-[#4a7bbf]"
                        : "border-l-2 border-l-[#9ca3af]"
                    }`}
                  >
                    <td className="px-3 py-2">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-ink">{b.name}</td>
                    <td className="px-3 py-2">{dash(b.parentName)}</td>
                    <td className="px-3 py-2">{dash(b.level)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-[#e8f5e9] px-2 py-0.5 text-xs text-[#2e7d32]">
                        {b.operation || "已生效"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[#2e7d32]">
                        {b.reviewStatus || "已生效"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {dash(b.createTime)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {rowOperable ? (
                          <>
                            <ActionBtn
                              className="bg-accent"
                              onClick={() => openEdit(b)}
                            >
                              编辑
                            </ActionBtn>
                            <ActionBtn
                              className="bg-[#c0392b]"
                              onClick={() => remove(b)}
                            >
                              删除
                            </ActionBtn>
                          </>
                        ) : null}
                        <ActionBtn
                          className="bg-[#5c6570]"
                          onClick={() => setDetail(b)}
                        >
                          详情
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>

        <PaginationBar
          page={page}
          totalPages={pages}
          onChange={setPage}
          leading={`共 ${shown.length} / ${total} 条`}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50, 100]}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </Card>

      {detail ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-line bg-panel shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line px-5 py-4 font-display text-lg">
              派户支详情
            </div>
            <dl className="space-y-3 px-5 py-4 text-sm">
              {[
                ["派户支名称", detail.name],
                ["全称", detail.fullName],
                ["上级派户支", detail.parentName],
                ["层级/世代", detail.level],
                ["始迁祖", detail.person],
                ["册次", detail.book],
                ["卷次", detail.volume],
                ["审核状态", detail.reviewStatus || "已生效"],
                ["创建时间", detail.createTime],
                ["备注", detail.remark],
              ].map(([k, v]) => (
                <div key={k as string} className="grid grid-cols-[7rem_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-ink">{dash(v as string | number | null)}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end border-t border-line px-5 py-3">
              <Button variant="secondary" onClick={() => setDetail(null)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {creating || editItem ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]"
          onClick={() => {
            setCreating(false);
            setEditItem(null);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-line bg-panel shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line px-5 py-4 font-display text-lg">
              {editItem ? "编辑派户支（提交审核）" : "新增派户支（提交审核）"}
            </div>
            {editItem ? (
              <div className="border-b border-amber-100 bg-amber-50/50 px-5 py-2 text-xs text-amber-900">
                相对当前库中数据的修改将在审核页以琥珀色高亮对照。
              </div>
            ) : null}
            <div className="px-5 py-4">
              <BranchForm
                value={form}
                onChange={setForm}
                compareWith={
                  editItem
                    ? {
                        name: editItem.name,
                        fullName: editItem.fullName,
                        parentId: editItem.parentId,
                        book: editItem.book || "",
                        person: editItem.person || "",
                        volume: editItem.volume || "",
                        remark: editItem.remark || "",
                        level: editItem.level,
                        personParentId: editItem.personParentId,
                        personParentName: editItem.personParentName || "",
                        personParentNo: editItem.personParentNo || "",
                      }
                    : null
                }
                parents={parents}
                lockParent={Boolean(editItem)}
                parentName={editItem?.parentName}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setCreating(false);
                  setEditItem(null);
                }}
              >
                取消
              </Button>
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => saveForm(false)}
              >
                暂存
              </Button>
              <Button disabled={saving} onClick={() => saveForm(true)}>
                提交审核
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
