"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BranchForm, emptyBranchPayload } from "@/components/BranchForm";
import { emptyPayload, PeopleForm } from "@/components/PeopleForm";
import { Button, Card, StatusPill } from "@/components/ui";
import {
  BranchPayload,
  ChangePayload,
  ChangeRequest,
  OBJECT_TYPE_LABEL,
  OP_LABEL,
  PeoplePayload,
} from "@/lib/types";

export default function EditDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ChangeRequest | null>(null);
  const [events, setEvents] = useState<
    {
      actor_name: string;
      actor_role: string;
      action: string;
      note: string | null;
      created_at: string;
    }[]
  >([]);
  const [payload, setPayload] = useState<ChangePayload | null>(null);
  const [parents, setParents] = useState<
    { id: number; name: string; fullName: string }[]
  >([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/requests/${params.id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "加载失败");
      return;
    }
    const it = data.item as ChangeRequest;
    setItem(it);
    if (it.objectType === "branch") {
      setPayload({ ...emptyBranchPayload(), ...(it.payload as BranchPayload) });
    } else {
      setPayload({ ...emptyPayload(), ...(it.payload as PeoplePayload) });
    }
    setEvents(data.events || []);
  }

  useEffect(() => {
    load();
    fetch("/api/branches?options=1")
      .then((r) => r.json())
      .then((d) => setParents(d.items || []))
      .catch(() => setParents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const editable = item && ["draft", "rejected"].includes(item.status);

  async function save(submit: boolean) {
    if (!payload || !item) return;
    const name = (payload as { name?: string }).name?.trim();
    if (!name) {
      setError(
        item.objectType === "branch" ? "请填写派户支名称" : "请填写姓名",
      );
      return;
    }
    if (item.objectType === "people") {
      const p = payload as PeoplePayload;
      if (!p.group?.trim()) {
        setError("请填写所属派户支");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, submit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setItem(data.item);
      if (submit) router.replace("/edit");
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!item || !payload) {
    return <div className="text-muted">{error || "加载中..."}</div>;
  }

  const title =
    item.objectType === "branch"
      ? item.operation === "create"
        ? "新增派户支"
        : item.operation === "delete"
          ? "删除派户支确认"
          : "编辑派户支"
      : item.operation === "create"
        ? "新增家谱成员"
        : item.operation === "delete"
          ? "删除成员确认"
          : "编辑成员信息";

  return (
    <div className="mx-auto max-w-5xl">
      {item.rejectReason ? (
        <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          驳回原因：{item.rejectReason}
        </Card>
      ) : null}

      {item.beforeSnapshot && item.operation !== "create" ? (
        <Card className="mb-4 border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-950">
          琥珀色高亮字段为相对原库数据的修改，下方显示「原值」便于对照。
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-xl text-ink">{title}</h1>
            <StatusPill status={item.status} />
            <span className="text-sm text-muted">
              #{item.id} · {OBJECT_TYPE_LABEL[item.objectType]} ·{" "}
              {OP_LABEL[item.operation]}
            </span>
          </div>
          <Link
            href="/edit"
            className="text-xl leading-none text-muted hover:text-ink"
            aria-label="关闭"
          >
            ×
          </Link>
        </div>

        <div className="max-h-[calc(100vh-260px)] overflow-y-auto px-5 py-5">
          {item.objectType === "branch" ? (
            <BranchForm
              value={payload as BranchPayload}
              onChange={setPayload}
              disabled={!editable || item.operation === "delete"}
              compareWith={item.beforeSnapshot as BranchPayload | null}
              parents={parents}
              lockParent={item.operation !== "create"}
              parentName={
                parents.find(
                  (p) => p.id === (payload as BranchPayload).parentId,
                )?.name || null
              }
            />
          ) : (
            <PeopleForm
              value={payload as PeoplePayload}
              onChange={setPayload}
              disabled={!editable || item.operation === "delete"}
              compareWith={item.beforeSnapshot as PeoplePayload | null}
            />
          )}
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

          <div className="mt-8 border-t border-line pt-4">
            <div className="mb-3 font-display text-base">流转记录</div>
            <ul className="space-y-3 text-sm">
              {events.map((e, idx) => (
                <li key={idx} className="border-l-2 border-accent-soft pl-3">
                  <div className="font-medium">{e.action}</div>
                  <div className="text-xs text-muted">
                    {e.actor_name} · {e.created_at}
                  </div>
                  {e.note ? (
                    <div className="mt-1 text-danger">{e.note}</div>
                  ) : null}
                </li>
              ))}
              {events.length === 0 ? (
                <li className="text-muted">暂无记录</li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-soft/40 px-5 py-4">
          <Link href="/edit">
            <Button variant="secondary" disabled={saving}>
              取消
            </Button>
          </Link>
          {editable ? (
            <>
              <Button
                disabled={saving}
                variant="secondary"
                onClick={() => save(false)}
              >
                暂存
              </Button>
              <Button disabled={saving} onClick={() => save(true)}>
                确认提交
              </Button>
            </>
          ) : (
            <p className="self-center text-sm text-muted">
              当前状态不可编辑，仅可查看。
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
