"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BranchForm, emptyBranchPayload } from "@/components/BranchForm";
import { emptyPayload, PeopleForm } from "@/components/PeopleForm";
import { Button, Card, StatusPill } from "@/components/ui";
import { networkErrorMessage, readJsonResponse } from "@/lib/api-client";
import { normalizePeopleRank } from "@/lib/people-client";
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
      setPayload(
        normalizePeopleRank({
          ...emptyPayload(),
          ...(it.payload as PeoplePayload),
        }),
      );
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
  const canWithdraw =
    item &&
    ["pending_1", "pending_2", "pending_final"].includes(item.status);
  const canDelete =
    item &&
    ["draft", "rejected", "pending_1", "pending_2", "pending_final"].includes(
      item.status,
    );

  async function withdraw() {
    if (!item) return;
    if (!confirm("确定撤回提交？单据将回到「暂存」，可再修改后重新提交。")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${params.id}/withdraw`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "撤回失败");
      setItem(data.item);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤回失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeRequest() {
    if (!item) return;
    if (
      !confirm(
        "确定删除此编修单？删除后不可恢复（不会改动已通过审核的正式库数据）。",
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(String(data.error || "删除失败"));
      router.replace("/edit");
    } catch (e) {
      setError(networkErrorMessage(e, "删除失败"));
      setSaving(false);
    }
  }

  async function save(submit: boolean) {
    if (!payload || !item) return;
    const name = (payload as { name?: string }).name?.trim();
    if (!name) {
      setError(
        item.objectType === "branch" ? "请填写派户支名称" : "请填写姓名",
      );
      return;
    }
    if (item.objectType === "people" || item.objectType === "daikao") {
      const p = payload as PeoplePayload;
      if (!p.group?.trim()) {
        setError("请填写所属派户支");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const body =
        item.objectType === "people" || item.objectType === "daikao"
          ? normalizePeopleRank(payload as PeoplePayload)
          : payload;
      // 用 POST：避免部分环境拦截 PATCH 导致 Failed to fetch
      const res = await fetch(`/api/requests/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: body, submit }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(String(data.error || "保存失败"));
      setItem(data.item as ChangeRequest);
      if (submit) router.replace("/edit");
      else await load();
    } catch (e) {
      setError(networkErrorMessage(e, "保存失败"));
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
      {item.status === "rejected" && item.rejectReason ? (
        <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="font-medium">已驳回，请按意见修改后重新提交</div>
          <div className="mt-1">驳回原因：{item.rejectReason}</div>
          <div className="mt-2 text-xs text-rose-700/90">
            修改下方信息后点击「确认提交」，将重新进入一审。
          </div>
        </Card>
      ) : null}

      {item.objectType === "people" &&
      (payload as PeoplePayload).sourceDaikaoId ? (
        <Card className="mb-4 border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950">
          来源：待考成员 #
          {(payload as PeoplePayload).sourceDaikaoId}
          ，入谱申请走审核通过后进入正式家谱。
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
              scope={item.objectType === "daikao" ? "daikao" : "people"}
              personId={
                item.objectType === "people" && item.operation === "update"
                  ? item.objectId
                  : null
              }
            />
          )}
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

        <div className="border-t border-line bg-soft/40 px-5 py-4">
          {error ? (
            <p className="mb-3 text-sm text-danger">{error}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {canDelete ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={saving}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={removeRequest}
                >
                  删除编修单
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/edit">
                <Button type="button" variant="secondary" disabled={saving}>
                  返回列表
                </Button>
              </Link>
              {canWithdraw ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={withdraw}
                >
                  撤回提交
                </Button>
              ) : null}
              {editable ? (
                <>
                  <Button
                    type="button"
                    disabled={saving}
                    variant="secondary"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => save(false)}
                  >
                    暂存
                  </Button>
                  <Button
                    type="button"
                    disabled={saving}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => save(true)}
                  >
                    确认提交
                  </Button>
                </>
              ) : !canWithdraw ? (
                <p className="self-center text-sm text-muted">
                  当前状态不可编辑，仅可查看。
                </p>
              ) : (
                <p className="self-center text-sm text-muted">
                  待审中：可撤回后修改，或删除本编修单。
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
