"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  AddRelation,
  AnchorSeed,
  LineageAddDialog,
  LineageContextMenu,
} from "@/components/LineageAddDialog";
import { ChartZoomViewport } from "@/components/ChartZoomViewport";
import { PersonNodeDrawer } from "@/components/PersonNodeDrawer";
import { PeopleListBackLink } from "@/components/PeopleListBackLink";
import { Button, Card, PageHeader } from "@/components/ui";
import type { PeopleRow, SessionUser } from "@/lib/types";
import {
  personApi,
  personListHref,
  personPage,
  type PeopleScope,
} from "@/lib/people-scope";

type Payload = {
  focus: PeopleRow;
  line: PeopleRow[];
  up: number;
  down: number;
  ancestorCount: number;
  descendantCount: number;
};

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <div className="inline-flex items-center overflow-hidden rounded-md border border-line bg-white">
        <button
          type="button"
          className="px-2.5 py-1.5 text-muted hover:bg-soft disabled:opacity-40"
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <input
          className="w-12 border-x border-line py-1.5 text-center outline-none"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        <button
          type="button"
          className="px-2.5 py-1.5 text-muted hover:bg-soft disabled:opacity-40"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

function YiziInner() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const scope: PeopleScope = pathname.includes("/daikao/") ? "daikao" : "people";
  const search = useSearchParams();
  const initUp = Math.min(100, Math.max(0, Number(search.get("up") || 1)));
  const initDown = Math.min(30, Math.max(0, Number(search.get("down") || 1)));
  const [up, setUp] = useState(initUp);
  const [down, setDown] = useState(initDown);
  const [queryUp, setQueryUp] = useState(initUp);
  const [queryDown, setQueryDown] = useState(initDown);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    id: number;
    name: string;
  } | null>(null);
  const [addDlg, setAddDlg] = useState<{
    relation: AddRelation;
    id: number;
    name: string;
    seed: AnchorSeed;
  } | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);

  const canEdit = user?.role === "editor" || user?.role === "admin";

  function resolveAnchorSeed(id: number, name: string): AnchorSeed {
    const seed: AnchorSeed = { id, name };
    if (!data) return seed;
    const idx = data.line.findIndex((p) => p.id === id);
    const p = idx >= 0 ? data.line[idx] : data.focus.id === id ? data.focus : null;
    if (p) {
      seed.sex = p.sex;
      seed.level = p.level;
      seed.parentId =
        idx > 0 ? data.line[idx - 1].id : p.parentId;
      seed.groupName = p.groupName || data.focus.groupName;
    } else {
      seed.groupName = data.focus.groupName;
    }
    return seed;
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => setUser(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams({
        up: String(queryUp),
        down: String(queryDown),
      });
      const res = await fetch(
        `${personApi(scope, `/${params.id}/yizi`)}?${sp}`,
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "加载失败");
      setData(d);
      setUp(d.up ?? queryUp);
      setDown(d.down ?? queryDown);
      const url = new URL(window.location.href);
      url.searchParams.set("up", String(d.up ?? queryUp));
      url.searchParams.set("down", String(d.down ?? queryDown));
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [params.id, queryUp, queryDown, scope]);

  useEffect(() => {
    load();
  }, [load]);

  const depthQs = `?up=${queryUp}&down=${queryDown}`;

  return (
    <div>
      <PageHeader
        title={scope === "daikao" ? "待考一字图" : "一字图"}
        desc={
          data
            ? `以「${data.focus.name}」为中心，上溯 ${data.up} 代、下延 ${data.down} 代，直系成一条线`
            : "直系上下成线，区别于树形世系图"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={personPage(scope, Number(params.id), "lineage")}>
              <Button variant="secondary">世系图</Button>
            </Link>
            <PeopleListBackLink listHref={personListHref(scope)}>
              <Button variant="ghost">返回列表</Button>
            </PeopleListBackLink>
          </div>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Stepper label="向上代数" value={up} min={0} max={100} onChange={setUp} />
          <Stepper
            label="向下代数"
            value={down}
            min={0}
            max={30}
            onChange={setDown}
          />
          <Button
            onClick={() => {
              setQueryUp(up);
              setQueryDown(down);
            }}
          >
            查询
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          向下沿长子（排行最左）支线延伸；金色为当前人物。左键查看详情
          {canEdit ? "并可编辑" : ""}。
          {canEdit
            ? " 右键可新增父节点 / 子节点（一字图为直系，调兄弟排行请用世系图拖拽）。"
            : ""}
        </p>
      </Card>

      {loading ? <Card className="p-8 text-center text-muted">加载中...</Card> : null}
      {error ? <Card className="p-4 text-accent">{error}</Card> : null}

      {data && !loading ? (
        <Card className="overflow-hidden p-0">
          <ChartZoomViewport className="p-6">
          <div className="mx-auto flex max-w-md flex-col items-center">
            {data.line.map((p, idx) => {
              const focus = p.id === data.focus.id;
              const isLast = idx === data.line.length - 1;
              return (
                <div key={p.id} className="flex w-full flex-col items-center">
                  <button
                    type="button"
                    className={`inline-flex min-w-[140px] flex-col items-center rounded-lg border px-4 py-3 text-center transition ${
                      focus
                        ? "border-[#c9a227] bg-[#c9a227] text-white shadow-card"
                        : p.sex === "女"
                          ? "border-[#c45c5c] bg-[#c45c5c] text-white hover:opacity-90"
                          : "border-[#4a7bbf] bg-[#4a7bbf] text-white hover:opacity-90"
                    }`}
                    title={
                      canEdit
                        ? "左键详情/编辑 · 右键新增父/子节点"
                        : "点击查看详情"
                    }
                    onClick={() => setDrawerId(p.id)}
                    onContextMenu={(e) => {
                      if (!canEdit) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setMenu({
                        x: e.clientX,
                        y: e.clientY,
                        id: p.id,
                        name: p.name,
                      });
                    }}
                  >
                    <span className="font-display text-lg tracking-wide">{p.name}</span>
                    <span className="mt-0.5 text-[11px] text-white/85">
                      {p.sex} · 第{p.level ?? "?"}世
                      {p.rank ? ` · ${p.rank}` : ""}
                    </span>
                  </button>
                  {!isLast ? (
                    <div className="flex flex-col items-center py-1">
                      <div className="h-5 w-px bg-line" />
                      <div className="text-[10px] text-muted">↓</div>
                      <div className="h-2 w-px bg-line" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-6 text-center text-xs text-muted">
            上 {data.ancestorCount} 代 · 下 {data.descendantCount} 代 · 点击节点查看详情 · 右上角可缩放
          </div>
          </ChartZoomViewport>
        </Card>
      ) : null}

      {menu ? (
        <LineageContextMenu
          x={menu.x}
          y={menu.y}
          name={menu.name}
          relations={["parent", "child"]}
          onClose={() => setMenu(null)}
          onSelect={(relation) =>
            setAddDlg({
              relation,
              id: menu.id,
              name: menu.name,
              seed: resolveAnchorSeed(menu.id, menu.name),
            })
          }
        />
      ) : null}

      {addDlg ? (
        <LineageAddDialog
          relation={addDlg.relation}
          anchorId={addDlg.id}
          anchorName={addDlg.name}
          anchorSeed={addDlg.seed}
          scope={scope}
          onClose={() => setAddDlg(null)}
          onSaved={() => load()}
        />
      ) : null}

      {drawerId != null ? (
        <PersonNodeDrawer
          personId={drawerId}
          canEdit={canEdit}
          scope={scope}
          focusHref={`${personPage(scope, drawerId, "yizi")}${depthQs}`}
          onClose={() => setDrawerId(null)}
          onSaved={() => load()}
        />
      ) : null}
    </div>
  );
}

export default function YiziPage() {
  return (
    <Suspense fallback={<div className="text-muted">加载中...</div>}>
      <YiziInner />
    </Suspense>
  );
}
