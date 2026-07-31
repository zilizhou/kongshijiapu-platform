"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { normalizePeopleRank, peopleToPayload } from "@/lib/people-client";
import {
  peopleDataSourceHint,
  peopleDataSourceLabel,
  resolvePeopleDataSource,
} from "@/lib/people-source";
import { PeoplePayload, PeopleRow } from "@/lib/types";
import { PeopleForm } from "./PeopleForm";
import { Button, DataSourcePill } from "./ui";

function dash(v: string | null | undefined) {
  return v && String(v).trim() ? String(v) : "-";
}

function formatGroup(g: string | null | undefined) {
  if (!g) return "-";
  const parts = g
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "-";
  return parts.reverse().join("/");
}

export function PersonNodeDrawer({
  personId,
  canEdit,
  focusHref,
  onClose,
  onSaved,
}: {
  personId: number;
  canEdit: boolean;
  /** 设为中心后的跳转地址，如 /people/123/lineage?up=1&down=1 */
  focusHref: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [person, setPerson] = useState<PeopleRow | null>(null);
  const [payload, setPayload] = useState<PeoplePayload | null>(null);
  const [baseline, setBaseline] = useState<PeoplePayload | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);

  /** 仅暂存/驳回可直接 PATCH 原单；待审中走 POST 合并或去编修页撤回 */
  const resumableRequestId =
    person?.reviewRequestId &&
    person.reviewStatus &&
    ["draft", "rejected"].includes(person.reviewStatus)
      ? person.reviewRequestId
      : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setEditing(false);
    setSavedId(null);
    setPerson(null);
    setPayload(null);
    setBaseline(null);
    fetch(`/api/people/${personId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.person) {
          setError("未找到该人物");
          return;
        }
        const p = d.person as PeopleRow;
        const snap = peopleToPayload(p);
        setPerson(p);
        setPayload(snap);
        setBaseline(snap);
      })
      .catch(() => {
        if (!cancelled) setError("加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  async function submit(submit: boolean) {
    if (!payload || !person) return;
    if (!payload.name.trim()) {
      setError("请填写姓名");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = normalizePeopleRank(payload);
      // 已有驳回/暂存单：直接 PATCH 原单，避免另开一张对不上
      const res = resumableRequestId
        ? await fetch(`/api/requests/${resumableRequestId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload: body, submit }),
          })
        : await fetch("/api/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operation: "update",
              objectId: person.id,
              payload: body,
              submit,
            }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setSavedId(data.item.id);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-ink/30"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-display text-2xl text-ink">
                {person?.name || (loading ? "加载中…" : "人物详情")}
              </div>
              {person ? (
                <DataSourcePill
                  source={resolvePeopleDataSource(person)}
                  title={peopleDataSourceHint(
                    resolvePeopleDataSource(person),
                  )}
                />
              ) : null}
            </div>
            {person ? (
              <div className="mt-1 text-sm text-muted">
                {person.sex} · 第 {person.level ?? "?"} 世
                {person.rank ? ` · ${person.rank}` : ""}
                {person.isHeir === "1" ? " · 出嗣" : ""}
                {" · "}
                {peopleDataSourceLabel(resolvePeopleDataSource(person))}
              </div>
            ) : null}
          </div>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-10 text-center text-muted">加载中…</p>
          ) : error && !person ? (
            <p className="text-sm text-danger">{error}</p>
          ) : savedId ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-ink">已创建变更单 #{savedId}</p>
              <p className="text-sm text-muted">
                {editing || payload
                  ? "终审通过后写入正式家谱。"
                  : "终审通过后生效。"}
              </p>
              <Link href={`/edit/${savedId}`}>
                <Button>查看编修单</Button>
              </Link>
            </div>
          ) : editing && payload ? (
            <PeopleForm
              value={payload}
              onChange={setPayload}
              compareWith={baseline}
            />
          ) : person ? (
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["所属派户支", formatGroup(person.groupName)],
                  ["谱号", person.no],
                  ["字", person.zi],
                  ["号", person.hao],
                  ["别名", person.alias],
                  ["排行", person.rank],
                  ["父名", person.parentName],
                  ["地址", person.address],
                  ["生年", person.birthday],
                  ["卒年", person.deathday],
                  ["配偶", person.spouse],
                  ["配偶信息", person.spouseInfo],
                  ["卷次", person.volume],
                  ["小传", person.description],
                  [
                    "数据来源",
                    peopleDataSourceLabel(resolvePeopleDataSource(person)),
                  ],
                  ["录入时间", person.createTime],
                  ["更新时间", person.editTime],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-ink">
                    {dash(v)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {error && person ? (
            <p className="mt-4 text-sm text-danger">{error}</p>
          ) : null}
        </div>

        {!loading && person && !savedId ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-soft/40 px-5 py-4">
            {editing ? (
              <>
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setPayload(peopleToPayload(person));
                    setError("");
                  }}
                >
                  取消编辑
                </Button>
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => submit(false)}
                >
                  暂存
                </Button>
                <Button disabled={saving} onClick={() => submit(true)}>
                  提交审核
                </Button>
              </>
            ) : (
              <>
                <Link
                  href={focusHref}
                  className="inline-flex items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-soft"
                >
                  设为中心
                </Link>
                {canEdit ? (
                  <Button type="button" className="shrink-0" onClick={() => setEditing(true)}>
                    编辑
                  </Button>
                ) : (
                  <span className="text-xs text-muted">当前角色仅可查看</span>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
