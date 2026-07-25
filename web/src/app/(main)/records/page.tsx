"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OP_LABEL, STATUS_LABEL } from "@/lib/types";
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

type RecordItem = {
  id: number;
  action: string;
  note: string | null;
  created_at: string;
  actor_name: string;
  request_id: number;
  operation: keyof typeof OP_LABEL;
  status: keyof typeof STATUS_LABEL;
  object_id: number | null;
  people_name: string | null;
};

export default function RecordsPage() {
  const [items, setItems] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [operation, setOperation] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const sp = new URLSearchParams({
      page: String(page),
      pageSize: "20",
    });
    if (operation) sp.set("operation", operation);
    if (action) sp.set("action", action);
    if (q) sp.set("q", q);
    const res = await fetch(`/api/records?${sp}`);
    const data = await res.json();
    if (res.ok) {
      setItems(data.items);
      setTotal(data.total);
    }
  }, [page, operation, action, q]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <PageHeader
        title="工作记录"
        desc="追踪你发起或审核过的操作，便于协作对账。"
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>操作类型</Label>
            <Select value={operation} onChange={(e) => setOperation(e.target.value)}>
              <option value="">全部</option>
              <option value="create">新增</option>
              <option value="update">修改</option>
              <option value="delete">删除</option>
            </Select>
          </div>
          <div>
            <Label>动作</Label>
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">全部</option>
              <option value="submit">提交</option>
              <option value="approve_1">一审通过</option>
              <option value="approve_2">二审通过</option>
              <option value="approve_final">终审通过</option>
              <option value="reject">驳回</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>关键词</Label>
            <Input clearable value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={() => { setPage(1); load(); }}>筛选</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <TableScroll>
          <table className="min-w-full text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">成员</th>
                <th className="px-4 py-3">单据操作</th>
                <th className="px-4 py-3">我的动作</th>
                <th className="px-4 py-3">当前状态</th>
                <th className="px-4 py-3">查看</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-line/70">
                  <td className="px-4 py-3 text-muted">{item.created_at}</td>
                  <td className="px-4 py-3 font-medium">{item.people_name || "—"}</td>
                  <td className="px-4 py-3">{OP_LABEL[item.operation]}</td>
                  <td className="px-4 py-3">
                    {item.action}
                    {item.note ? (
                      <div className="text-xs text-danger">{item.note}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="text-accent hover:underline"
                      href={`/edit/${item.request_id}`}
                    >
                      #{item.request_id}
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-muted">
                    暂无记录
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
