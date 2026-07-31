"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { emptyPayload, PeopleForm } from "@/components/PeopleForm";
import { PeopleListBackLink } from "@/components/PeopleListBackLink";
import { Button, Card } from "@/components/ui";
import { normalizePeopleRank, peopleToPayload } from "@/lib/people-client";
import { PeoplePayload, PeopleRow } from "@/lib/types";

function rowToPayload(p: PeopleRow): PeoplePayload {
  return { ...emptyPayload(), ...peopleToPayload(p) };
}

function NewEditInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const fromId = sp.get("from");
  const daikaoId = sp.get("daikao");
  const op = (sp.get("op") || "create") as "create" | "update";
  const [payload, setPayload] = useState<PeoplePayload>(emptyPayload());
  const [objectId, setObjectId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(fromId || daikaoId));
  const [parentHint, setParentHint] = useState("");
  const [parentCandidates, setParentCandidates] = useState<
    {
      id: number;
      name: string;
      sex: string;
      level: number | null;
      groupName: string | null;
      parentName: string | null;
    }[]
  >([]);

  useEffect(() => {
    if (daikaoId) {
      setLoading(true);
      fetch(`/api/daikao/${daikaoId}/admit-draft`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "加载待考失败");
          setPayload({ ...emptyPayload(), ...(d.payload as PeoplePayload) });
          setParentCandidates(d.parentCandidates || []);
          if (d.parentMatch === "ambiguous") {
            setParentHint(
              `待考父亲「${d.parentName}」在正式库中重名，请在下方「当前父」中选择正确的一位。`,
            );
          } else if (d.parentMatch === "unique") {
            setParentHint(
              `已根据待考父亲「${d.parentName}」自动匹配正式库成员。`,
            );
          } else if (d.parentName) {
            setParentHint(
              `待考记载父亲「${d.parentName}」，正式库未唯一匹配，请手工选择当前父。`,
            );
          } else {
            setParentHint("请选择正式库中的当前父（若无父可留空）。");
          }
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : "加载待考失败"),
        )
        .finally(() => setLoading(false));
      return;
    }
    if (!fromId) return;
    setLoading(true);
    fetch(`/api/people/${fromId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.person) return;
        const p = d.person as PeopleRow;
        // 修改且已有暂存/驳回/待审单：回到原单，驳回后可直接改后重提
        if (
          op === "update" &&
          p.reviewRequestId &&
          p.reviewStatus &&
          ["draft", "rejected", "pending_1", "pending_2", "pending_final"].includes(
            p.reviewStatus,
          )
        ) {
          router.replace(`/edit/${p.reviewRequestId}`);
          return;
        }
        setObjectId(p.id);
        if (op === "create") {
          setPayload({
            ...emptyPayload(),
            parentId: p.id,
            group: p.groupName || "",
            level: p.level != null ? Number(p.level) + 1 : null,
            originalData: "1",
          });
        } else {
          setPayload(rowToPayload(p));
        }
      })
      .finally(() => setLoading(false));
  }, [fromId, op, daikaoId, router]);

  async function save(submit: boolean) {
    if (!payload.name.trim()) {
      setError("请填写姓名");
      return;
    }
    if (!payload.group?.trim()) {
      setError("请填写所属派户支");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: op === "update" ? "update" : "create",
          objectId: op === "update" ? objectId : null,
          payload: normalizePeopleRank(payload),
          submit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      router.replace(`/edit/${data.item.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const isAdmit = Boolean(daikaoId);
  const title =
    op === "update"
      ? "编辑成员信息"
      : isAdmit
        ? "待考申请入谱"
        : "新增家谱成员";

  return (
    <div className="mx-auto max-w-5xl">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h1 className="font-display text-xl text-ink">{title}</h1>
            {isAdmit ? (
              <p className="mt-1 text-xs text-muted">
                来源待考 #{daikaoId} · 提交后走一/二/终审，通过后写入正式家谱
              </p>
            ) : null}
          </div>
          {isAdmit ? (
            <Link
              href="/daikao"
              className="text-xl leading-none text-muted hover:text-ink"
              aria-label="关闭"
            >
              ×
            </Link>
          ) : (
            <PeopleListBackLink
              className="text-xl leading-none text-muted hover:text-ink"
              aria-label="关闭"
            >
              ×
            </PeopleListBackLink>
          )}
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="text-muted">加载中…</div>
          ) : (
            <>
              {isAdmit && parentHint ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
                  {parentHint}
                </div>
              ) : null}
              {isAdmit && parentCandidates.length > 1 ? (
                <div className="mb-4 rounded-lg border border-line bg-soft/50 px-3 py-2">
                  <div className="mb-2 text-xs font-medium text-ink">
                    重名父亲候选（点选后写入「当前父」）
                  </div>
                  <div className="max-h-40 space-y-1 overflow-auto text-xs">
                    {parentCandidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`block w-full rounded-md px-2 py-1.5 text-left hover:bg-panel ${
                          payload.parentId === c.id
                            ? "bg-panel ring-1 ring-accent/40"
                            : ""
                        }`}
                        onClick={() =>
                          setPayload((p) => ({ ...p, parentId: c.id }))
                        }
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted">
                          {" "}
                          · ID {c.id}
                          {c.level != null ? ` · ${c.level}世` : ""}
                          {c.groupName ? ` · ${c.groupName}` : ""}
                          {c.parentName ? ` · 父:${c.parentName}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <PeopleForm value={payload} onChange={setPayload} />
            </>
          )}
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-soft/40 px-5 py-4">
          {isAdmit ? (
            <Link href="/daikao">
              <Button variant="secondary" disabled={saving}>
                取消
              </Button>
            </Link>
          ) : (
            <PeopleListBackLink>
              <Button variant="secondary" disabled={saving}>
                取消
              </Button>
            </PeopleListBackLink>
          )}
          <Button
            disabled={saving || loading}
            variant="secondary"
            onClick={() => save(false)}
          >
            暂存
          </Button>
          <Button disabled={saving || loading} onClick={() => save(true)}>
            确认提交
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function NewEditPage() {
  return (
    <Suspense fallback={<div className="text-muted">加载中...</div>}>
      <NewEditInner />
    </Suspense>
  );
}
