"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChangeRequest, OBJECT_TYPE_LABEL, OP_LABEL } from "@/lib/types";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  StatusPill,
  TableScroll,
  tableHeadClass,
} from "@/components/ui";

export default function EditListPage() {
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [operation, setOperation] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const sp = new URLSearchParams({
      mode: "mine",
      page: String(page),
      pageSize: "20",
    });
    if (status) sp.set("status", status);
    if (operation) sp.set("operation", operation);
    if (q) sp.set("q", q);
    const res = await fetch(`/api/requests?${sp}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "加载失败");
      return;
    }
    setItems(data.items);
    setTotal(data.total);
  }, [page, status, operation, q]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <PageHeader
        title="我的编修"
        desc="家谱成员与派户支的变更单。未完结修改会合并；审核页可对照高亮修改前后。"
        actions={
          <Link href="/edit/new">
            <Button>新增成员</Button>
          </Link>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>状态</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部</option>
              <option value="draft">暂存</option>
              <option value="pending_1">待一审</option>
              <option value="pending_2">待二审</option>
              <option value="pending_final">待终审</option>
              <option value="rejected">已驳回</option>
              <option value="approved">已通过</option>
            </Select>
          </div>
          <div>
            <Label>操作类型</Label>
            <Select value={operation} onChange={(e) => setOperation(e.target.value)}>
              <option value="">全部</option>
              <option value="create">新增</option>
              <option value="update">修改</option>
              <option value="delete">删除</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>关键词</Label>
            <Input clearable value={q} onChange={(e) => setQ(e.target.value)} placeholder="姓名 / 单号" />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => { setPage(1); load(); }}>筛选</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setStatus("");
              setOperation("");
              setQ("");
              setPage(1);
            }}
          >
            重置
          </Button>
        </div>
      </Card>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      <Card className="overflow-hidden">
        <TableScroll>
          <table className="min-w-full text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-4 py-3">单号</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">对象ID</th>
                <th className="px-4 py-3">操作</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">更新时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-line/70">
                  <td className="px-4 py-3">#{item.id}</td>
                  <td className="px-4 py-3">
                    {OBJECT_TYPE_LABEL[item.objectType] || "家谱成员"}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {(item.payload as { name?: string }).name}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {item.objectId != null ? item.objectId : "-"}
                  </td>
                  <td className="px-4 py-3">{OP_LABEL[item.operation]}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={item.status} />
                    {item.rejectReason ? (
                      <div className="mt-1 max-w-xs text-xs text-danger">
                        驳回：{item.rejectReason}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">{item.updatedAt}</td>
                  <td className="px-4 py-3">
                    <Link className="text-accent hover:underline" href={`/edit/${item.id}`}>
                      {["draft", "rejected"].includes(item.status) ? "编辑" : "查看"}
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-muted">
                    暂无编修单
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
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages}
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
