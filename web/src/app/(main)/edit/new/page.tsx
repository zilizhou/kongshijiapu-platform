"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { emptyPayload, PeopleForm } from "@/components/PeopleForm";
import { Button, Card } from "@/components/ui";
import { peopleToPayload } from "@/lib/people-client";
import { PeoplePayload, PeopleRow } from "@/lib/types";

function rowToPayload(p: PeopleRow): PeoplePayload {
  return { ...emptyPayload(), ...peopleToPayload(p) };
}

function NewEditInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const fromId = sp.get("from");
  const op = (sp.get("op") || "create") as "create" | "update";
  const [payload, setPayload] = useState<PeoplePayload>(emptyPayload());
  const [objectId, setObjectId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fromId) return;
    fetch(`/api/people/${fromId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.person) return;
        const p = d.person as PeopleRow;
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
      });
  }, [fromId, op]);

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
          payload,
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

  const title = op === "update" ? "编辑成员信息" : "新增家谱成员";

  return (
    <div className="mx-auto max-w-5xl">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h1 className="font-display text-xl text-ink">{title}</h1>
          <Link
            href="/people"
            className="text-xl leading-none text-muted hover:text-ink"
            aria-label="关闭"
          >
            ×
          </Link>
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-5 py-5">
          <PeopleForm value={payload} onChange={setPayload} />
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-soft/40 px-5 py-4">
          <Link href="/people">
            <Button variant="secondary" disabled={saving}>
              取消
            </Button>
          </Link>
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
