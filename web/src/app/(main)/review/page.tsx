"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ChangeRequest,
  OBJECT_TYPE_LABEL,
  OP_LABEL,
  SessionUser,
} from "@/lib/types";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  StatusPill,
  TableScroll,
  tableHeadClass,
} from "@/components/ui";

export default function ReviewListPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

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
  }, [page, q, canReview]);

  useEffect(() => {
    if (ready && canReview) load();
  }, [load, ready, canReview]);

  const pages = Math.max(1, Math.ceil(total / 20));

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
        desc="家谱与派户支共用审流。一审改后可送二审，二审改后送终审，终审改后直接生效；修改字段会琥珀色高亮对照原值。"
      />

      <Card className="mb-4 p-4">
        <Label>关键词</Label>
        <div className="mt-1 flex gap-2">
          <Input
            clearable
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="姓名 / 单号"
          />
          <Button
            onClick={() => {
              setPage(1);
              load();
            }}
          >
            筛选
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
                <th className="px-4 py-3">操作</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">提交人</th>
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
                  <td colSpan={7} className="px-4 py-8 text-muted">
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
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
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
