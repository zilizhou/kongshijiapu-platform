"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, PageHeader, TableScroll } from "@/components/ui";
import type { PeopleRow } from "@/lib/types";

type Payload = {
  focus: PeopleRow;
  generations: { level: number; people: PeopleRow[] }[];
};

export default function PeersPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/people/${params.id}/peers`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "加载失败");
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <div>
      <PageHeader
        title="同辈图"
        desc={
          data
            ? `以「${data.focus.name}」为参照，按世代横排同辈姓名`
            : "按世代横向排列族人，便于对照同辈"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/people/${params.id}/lineage`}>
              <Button variant="secondary">世系图</Button>
            </Link>
            <Link href={`/people/${params.id}/yizi`}>
              <Button variant="secondary">一字图</Button>
            </Link>
            <Link href="/people">
              <Button variant="ghost">返回列表</Button>
            </Link>
          </div>
        }
      />

      {loading ? <Card className="p-8 text-center text-muted">加载中...</Card> : null}
      {error ? <Card className="p-4 text-accent">{error}</Card> : null}

      {data ? (
        <Card className="overflow-hidden p-0">
          <TableScroll className="p-5">
          <div className="min-w-[640px] space-y-3">
            {data.generations.map((g) => (
              <div
                key={g.level}
                className="flex items-stretch gap-3 rounded-xl border border-line bg-soft/60 p-3"
              >
                <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-lg bg-sidebar px-2 py-3 text-white">
                  <div className="text-[11px] text-white/70">世代</div>
                  <div className="font-display text-xl">{g.level}</div>
                </div>
                <div className="flex flex-1 flex-wrap content-center gap-2">
                  {g.people.map((p) => {
                    const focus = p.id === data.focus.id;
                    return (
                      <Link
                        key={p.id}
                        href={`/people/${p.id}/peers`}
                        className={`rounded-md border px-3 py-2 text-sm transition ${
                          focus
                            ? "border-accent bg-accent font-medium text-white"
                            : p.sex === "女"
                              ? "border-line bg-white text-ink hover:border-accent/40"
                              : "border-[#c9b59f] bg-[#fff8ef] text-ink hover:border-accent/40"
                        }`}
                        title={`${p.name} ${p.no || ""}`}
                      >
                        <span className="font-display tracking-wide">{p.name}</span>
                        {p.no ? (
                          <span
                            className={`ml-1 text-[10px] ${
                              focus ? "text-white/75" : "text-muted"
                            }`}
                          >
                            {p.no}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center text-xs text-muted">
            同代由左至右排列 · 高亮为当前中心人物 · 点击他人可切换中心
          </div>
          </TableScroll>
        </Card>
      ) : null}
    </div>
  );
}
