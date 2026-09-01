"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BranchForm, emptyBranchPayload } from "@/components/BranchForm";
import { emptyPayload, fillExistingPeoplePayload, PeopleForm } from "@/components/PeopleForm";
import { Button, Card, Label, PageHeader, StatusPill, Textarea } from "@/components/ui";
import {
  BranchPayload,
  ChangePayload,
  ChangeRequest,
  OBJECT_TYPE_LABEL,
  OP_LABEL,
  PeoplePayload,
  SessionUser,
} from "@/lib/types";
import Link from "next/link";
import { networkErrorMessage, readJsonResponse } from "@/lib/api-client";

function approveLabel(
  status: ChangeRequest["status"],
  role: SessionUser["role"] | undefined,
) {
  // 终审任意待审通过即落库生效
  if (role === "final" || status === "pending_final") {
    return "保存并通过（生效）";
  }
  if (status === "pending_1") return "保存并送二审";
  if (status === "pending_2") return "保存并送终审";
  return "保存并通过";
}

export default function ReviewDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [item, setItem] = useState<ChangeRequest | null>(null);
  const [payload, setPayload] = useState<ChangePayload | null>(null);
  const [parents, setParents] = useState<
    { id: number; name: string; fullName: string }[]
  >([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(false);

  const canReview = ["first", "second", "final", "admin"].includes(
    user?.role || "",
  );

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
      const peoplePayload = it.payload as PeoplePayload;
      setPayload(
        it.operation === "create"
          ? { ...emptyPayload(), ...peoplePayload }
          : fillExistingPeoplePayload(
              peoplePayload,
              it.beforeSnapshot as PeoplePayload | null,
            ),
      );
    }
    setDirty(false);
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !canReview) return;
    load();
    fetch("/api/branches?options=1")
      .then((r) => r.json())
      .then((d) => setParents(d.items || []))
      .catch(() => setParents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, ready, canReview]);

  const compareWith = useMemo(() => {
    if (!item?.beforeSnapshot) return null;
    return item.beforeSnapshot;
  }, [item]);

  async function saveOnly() {
    if (!payload) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, asReviewer: true }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(String(data.error || "保存失败"));
      setItem(data.item as ChangeRequest);
      setDirty(false);
    } catch (e) {
      setError(networkErrorMessage(e, "保存失败"));
    } finally {
      setBusy(false);
    }
  }

  async function saveAndApprove() {
    if (!payload) return;
    const people = payload as PeoplePayload;
    if (
      item?.objectType === "people" &&
      item.operation === "create" &&
      (people.parentId == null || people.parentId === 0)
    ) {
      setError("请选择当前父（图上新增若父节点仍待审，请先通过父节点单据）");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // 有修改时把 payload 一并交给 approve，服务端先保存再通过（单次请求，避免两段 fetch 被失焦/中断）
      const res = await fetch(`/api/requests/${params.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dirty ? { payload } : {}),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(String(data.error || "通过失败"));
      setDirty(false);
      router.replace("/review");
    } catch (e) {
      setError(networkErrorMessage(e, "通过失败"));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setError("请填写驳回原因");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requests/${params.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(String(data.error || "驳回失败"));
      router.replace("/review");
    } catch (e) {
      setError(networkErrorMessage(e, "驳回失败"));
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
        <PageHeader title="信息审核" desc="录入员无审核权限。" />
        <Card className="flex min-h-[240px] flex-col items-center justify-center p-10 text-center">
          <div className="font-display text-2xl text-ink">无权限</div>
          <p className="mt-3 text-sm text-muted">
            请在「我的编修」查看或处理自己的变更单。
          </p>
          <Link href="/edit" className="mt-6">
            <Button>前往我的编修</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!item || !payload) {
    return <div className="text-muted">{error || "加载中..."}</div>;
  }

  const titleName = (payload as { name?: string }).name || "";

  return (
    <div>
      <PageHeader
        title={`审核 #${item.id}`}
        desc={`${OBJECT_TYPE_LABEL[item.objectType]} · ${OP_LABEL[item.operation]} · ${titleName} · 提交人 ${item.submitterName}`}
        actions={<StatusPill status={item.status} />}
      />

      {item.objectType === "people" &&
      (payload as PeoplePayload).sourceDaikaoId ? (
        <Card className="mb-4 border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950">
          来源：待考成员 #
          {(payload as PeoplePayload).sourceDaikaoId}
          <Link
            href="/daikao"
            className="ml-2 text-accent hover:underline"
          >
            打开待考管理
          </Link>
          （终审通过后写入正式家谱并回写待考状态）
        </Card>
      ) : null}

      {item.beforeSnapshot && item.operation !== "create" ? (
        <Card className="mb-4 border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-950">
          琥珀色高亮字段为相对库中原值的修改；下方「原值」可对照。一审/二审可改后送下一级；终审改完直接生效，也可直接处理录入员刚提交的待审单。
        </Card>
      ) : null}

      <Card className="mb-4 p-5">
        {item.objectType === "branch" ? (
          <BranchForm
            value={payload as BranchPayload}
            onChange={(v) => {
              setPayload(v);
              setDirty(true);
            }}
            disabled={item.operation === "delete"}
            compareWith={compareWith as BranchPayload | null}
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
            onChange={(v) => {
              setPayload(v);
              setDirty(true);
            }}
            disabled={item.operation === "delete"}
            compareWith={compareWith as PeoplePayload | null}
            scope={item.objectType === "daikao" ? "daikao" : "people"}
          />
        )}
      </Card>

      <Card className="sticky bottom-4 p-4 shadow-card">
        <div className="mb-3">
          <Label>驳回原因（驳回时必填）</Label>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="说明需要录入员修改的问题"
          />
        </div>
        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            variant="secondary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveOnly}
          >
            仅保存修改
          </Button>
          <Button
            disabled={busy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveAndApprove}
          >
            {approveLabel(item.status, user?.role)}
          </Button>
          <Button
            disabled={busy}
            variant="danger"
            onMouseDown={(e) => e.preventDefault()}
            onClick={reject}
          >
            驳回至录入员
          </Button>
        </div>
      </Card>
    </div>
  );
}
