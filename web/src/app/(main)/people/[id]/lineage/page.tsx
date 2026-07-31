"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import type { LineageNode, PeopleRow, SessionUser } from "@/lib/types";

type Payload = {
  focus: PeopleRow;
  ancestors: PeopleRow[];
  tree: LineageNode | null;
  up: number;
  down: number;
  reviewingIds: number[];
  pendingSiblings?: LineageNode[];
  pendingParents?: { asParentOf: number; node: LineageNode }[];
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
          className="w-10 border-x border-line py-1.5 text-center outline-none"
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

function nodeTone(
  sex: string,
  opts: { focus?: boolean; reviewing?: boolean; pending?: boolean },
): string {
  if (opts.pending) {
    return "border-dashed border-[#0d9488] bg-[#ccfbf1] text-[#0f766e] hover:bg-[#99f6e4]";
  }
  if (opts.focus) {
    return "border-[#c9a227] bg-[#c9a227] text-white shadow-card";
  }
  if (opts.reviewing) {
    return "border-[#9ca3af] bg-[#9ca3af] text-white";
  }
  if (sex === "女") {
    return "border-[#c45c5c] bg-[#c45c5c] text-white hover:opacity-90";
  }
  return "border-[#4a7bbf] bg-[#4a7bbf] text-white hover:opacity-90";
}

function PersonCard({
  p,
  focusId,
  reviewingIds,
  canEdit,
  onOpen,
  onOpenPending,
  onContextMenu,
}: {
  p: {
    id: number;
    name: string;
    sex: string;
    no: string | null;
    level: number | null;
    spouse?: string | null;
    rank?: string | null;
    pending?: boolean;
    requestId?: number;
  };
  focusId: number;
  reviewingIds: Set<number>;
  canEdit: boolean;
  onOpen: (id: number) => void;
  onOpenPending: (requestId: number) => void;
  onContextMenu: (e: React.MouseEvent, node: { id: number; name: string }) => void;
}) {
  const pending = Boolean(p.pending);
  const focus = !pending && p.id === focusId;
  const reviewing = !pending && reviewingIds.has(p.id);
  return (
    <button
      type="button"
      className={`inline-flex min-w-[92px] flex-col items-center rounded-lg border-2 px-3 py-2 text-center transition ${nodeTone(
        p.sex,
        { focus, reviewing, pending },
      )}`}
      title={
        pending
          ? `待审新增 · 编修单 #${p.requestId}`
          : focus
            ? "当前人物 · 点击查看详情"
            : reviewing
              ? "有未完成变更 · 点击查看详情"
              : canEdit
                ? "左键详情/编辑 · 右键新增 · 拖拽兄弟调整长幼"
                : "点击查看详情"
      }
      onClick={() => {
        if (pending && p.requestId) onOpenPending(p.requestId);
        else onOpen(p.id);
      }}
      onContextMenu={(e) => {
        if (!canEdit || pending) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, { id: p.id, name: p.name });
      }}
    >
      <span className="font-display text-base">{p.name}</span>
      {pending ? (
        <span className="mt-0.5 text-[11px] font-medium">待审新增</span>
      ) : p.rank ? (
        <span className="mt-0.5 text-[11px] font-medium text-white">{p.rank}</span>
      ) : null}
      <span
        className={`mt-0.5 text-[11px] ${pending ? "text-[#0f766e]/80" : "text-white/85"}`}
      >
        {p.sex} · 第{p.level ?? "?"}世
      </span>
      {p.no ? (
        <span className="text-[10px] text-white/75">{p.no}</span>
      ) : null}
      {pending && p.requestId ? (
        <span className="text-[10px] text-[#0f766e]/70">#{p.requestId}</span>
      ) : null}
    </button>
  );
}

function TreeBranch({
  node,
  focusId,
  reviewingIds,
  canEdit,
  onOpen,
  onOpenPending,
  onContextMenu,
  onReorderChildren,
}: {
  node: LineageNode;
  focusId: number;
  reviewingIds: Set<number>;
  canEdit: boolean;
  onOpen: (id: number) => void;
  onOpenPending: (requestId: number) => void;
  onContextMenu: (e: React.MouseEvent, node: { id: number; name: string }) => void;
  onReorderChildren: (parentId: number, childIds: number[]) => void;
}) {
  const [kids, setKids] = useState(node.children);
  const dragId = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const suppressClick = useRef(false);
  const realKids = kids.filter((c) => !c.pending);
  const canDrag = canEdit && !node.pending && realKids.length > 1;

  useEffect(() => {
    setKids(node.children);
  }, [node.children]);

  function moveBefore(fromId: number, toId: number) {
    if (fromId === toId || fromId < 0 || toId < 0) return;
    const ids = kids.map((c) => c.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    const map = new Map(kids.map((c) => [c.id, c]));
    setKids(next.map((id) => map.get(id)!));
    // 只提交已入库兄弟的顺序
    onReorderChildren(
      node.id,
      next.filter((id) => id > 0),
    );
  }

  return (
    <div className="flex flex-col items-center">
      <PersonCard
        p={node}
        focusId={focusId}
        reviewingIds={reviewingIds}
        canEdit={canEdit}
        onOpen={onOpen}
        onOpenPending={onOpenPending}
        onContextMenu={onContextMenu}
      />
      {node.spouse && !node.pending ? (
        <div className="mt-1 text-xs text-muted">配 {node.spouse}</div>
      ) : null}
      {kids.length ? (
        <>
          <div className="my-2 h-5 w-0.5 bg-[#8a9bb0]" />
          <div className="lineage-sibs">
            {kids.map((c, idx) => {
              const draggable = canDrag && !c.pending;
              return (
              <div
                key={c.id}
                className={`lineage-sib ${
                  draggable
                    ? "cursor-grab rounded-lg hover:bg-black/[0.03] active:cursor-grabbing"
                    : ""
                } ${dragging === c.id ? "opacity-50" : ""}`}
                draggable={draggable}
                onDragStart={(e) => {
                  if (!draggable) return;
                  dragId.current = c.id;
                  setDragging(c.id);
                  suppressClick.current = false;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(c.id));
                }}
                onDragEnd={() => {
                  setDragging(null);
                  dragId.current = null;
                }}
                onDragOver={(e) => {
                  if (!draggable) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  if (!canDrag || c.pending) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const from =
                    dragId.current ?? Number(e.dataTransfer.getData("text/plain"));
                  if (from && from > 0) {
                    suppressClick.current = true;
                    moveBefore(from, c.id);
                  }
                  dragId.current = null;
                  setDragging(null);
                }}
                onClickCapture={(e) => {
                  if (suppressClick.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    suppressClick.current = false;
                  }
                }}
              >
                <div className="mb-1 text-[10px] text-muted">
                  {c.pending
                    ? "待审"
                    : `${["長", "次", "三", "四", "五", "六", "七", "八", "九", "十"][idx] || String(idx + 1)}${c.sex === "女" ? "女" : "子"}`}
                </div>
                <TreeBranch
                  node={c}
                  focusId={focusId}
                  reviewingIds={reviewingIds}
                  canEdit={canEdit}
                  onOpen={onOpen}
                  onOpenPending={onOpenPending}
                  onContextMenu={onContextMenu}
                  onReorderChildren={onReorderChildren}
                />
              </div>
            );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function LineageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const initUp = Math.min(10, Math.max(0, Number(search.get("up") || 1)));
  const initDown = Math.min(6, Math.max(0, Number(search.get("down") || 1)));
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
  const [pendingReorder, setPendingReorder] = useState<{
    parentId: number;
    childIds: number[];
  } | null>(null);
  const [reorderMsg, setReorderMsg] = useState("");
  const [reorderBusy, setReorderBusy] = useState(false);

  const canEdit = user?.role === "editor" || user?.role === "admin";

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
      const res = await fetch(`/api/people/${params.id}/lineage?${sp}`);
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
  }, [params.id, queryUp, queryDown]);

  useEffect(() => {
    load();
  }, [load]);

  const reviewingIds = new Set(data?.reviewingIds || []);
  const depthQs = `?up=${queryUp}&down=${queryDown}`;
  const openPending = useCallback(
    (rid: number) => {
      router.push(`/edit/${rid}`);
    },
    [router],
  );

  const resolveAnchorSeed = useCallback(
    (id: number, name: string): AnchorSeed => {
      const seed: AnchorSeed = { id, name };
      if (!data) return seed;
      if (data.focus.id === id) {
        seed.sex = data.focus.sex;
        seed.level = data.focus.level;
        seed.parentId = data.focus.parentId;
        seed.groupName = data.focus.groupName;
        return seed;
      }
      const ancIdx = data.ancestors.findIndex((a) => a.id === id);
      if (ancIdx >= 0) {
        const a = data.ancestors[ancIdx];
        seed.sex = a.sex;
        seed.level = a.level;
        seed.parentId =
          ancIdx > 0 ? data.ancestors[ancIdx - 1].id : a.parentId;
        seed.groupName = a.groupName || data.focus.groupName;
        return seed;
      }
      // 在统一宽谱树中查找：父节点即当前遍历节点
      const walk = (node: LineageNode, parentId: number | null): boolean => {
        if (node.id === id) {
          seed.sex = node.sex;
          seed.level = node.level;
          seed.parentId = parentId;
          seed.groupName = data.focus.groupName;
          return true;
        }
        for (const c of node.children || []) {
          if (walk(c, node.id)) return true;
        }
        return false;
      };
      if (data.tree) {
        const rootParent =
          data.ancestors.length > 0
            ? data.ancestors[0].parentId ?? null
            : data.focus.parentId;
        walk(data.tree, rootParent);
      }
      if (seed.groupName == null) seed.groupName = data.focus.groupName;
      return seed;
    },
    [data],
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: { id: number; name: string }) => {
      setMenu({ x: e.clientX, y: e.clientY, id: node.id, name: node.name });
    },
    [],
  );

  const onReorderChildren = useCallback(
    (parentId: number, childIds: number[]) => {
      if (!canEdit) return;
      setPendingReorder({ parentId, childIds });
      setReorderMsg("");
    },
    [canEdit],
  );

  async function submitReorder() {
    if (!pendingReorder || reorderBusy) return;
    setReorderBusy(true);
    setReorderMsg("");
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "reorder",
          objectId: pendingReorder.parentId,
          payload: { name: "排行調整", childIds: pendingReorder.childIds },
          submit: true,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "提交排行失败");
      setReorderMsg(`已提交排行调整单 #${d.item.id}，终审通过后生效`);
      setPendingReorder(null);
      await load();
    } catch (e) {
      setReorderMsg(e instanceof Error ? e.message : "提交排行失败");
    } finally {
      setReorderBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="世系图"
        desc={
          data
            ? `以「${data.focus.name}」为中心，上溯 ${data.up} 代、下延 ${data.down} 代（含各代兄弟分支）`
            : "宽谱树形展示祖先、同辈兄弟及其子嗣"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/people/${params.id}/yizi`}>
              <Button variant="secondary">一字图</Button>
            </Link>
            <PeopleListBackLink>
              <Button variant="ghost">返回列表</Button>
            </PeopleListBackLink>
          </div>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Stepper label="向上代数" value={up} min={0} max={10} onChange={setUp} />
          <Stepper
            label="向下代数"
            value={down}
            min={0}
            max={6}
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
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#4a7bbf]" />
            蓝色：男性
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#c45c5c]" />
            红色：女性
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#9ca3af]" />
            灰色：已有变更待审
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#0d9488] bg-[#ccfbf1]" />
            青绿虚线：待审新增
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#c9a227]" />
            金色：当前人物节点
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          左键查看详情{canEdit ? "并可编辑" : ""}；新增用右侧抽屉。
          {canEdit
            ? "右键新增父/兄弟/子；拖拽同父兄弟调整长幼（最左为长），确认后提交审核。"
            : "设为中心可在详情抽屉中操作。"}
        </p>
        {reorderMsg ? (
          <p className="mt-2 text-xs text-accent">{reorderMsg}</p>
        ) : null}
      </Card>

      {loading ? <Card className="p-8 text-center text-muted">加载中...</Card> : null}
      {error ? <Card className="p-4 text-accent">{error}</Card> : null}

      {data && !loading ? (
        <Card className="overflow-hidden p-0">
          <ChartZoomViewport className="p-6">
            {(data.pendingParents || []).length ? (
              <div className="mb-4 flex flex-col items-center gap-2">
                <div className="text-xs text-muted">待审父辈（尚未入库）</div>
                <div className="flex flex-wrap justify-center gap-3">
                  {(data.pendingParents || []).map((p) => (
                    <div key={p.node.id} className="flex flex-col items-center">
                      <PersonCard
                        p={p.node}
                        focusId={data.focus.id}
                        reviewingIds={reviewingIds}
                        canEdit={canEdit}
                        onOpen={setDrawerId}
                        onOpenPending={openPending}
                        onContextMenu={onNodeContextMenu}
                      />
                      <div className="mt-1 text-[10px] text-muted">
                        挂于 #{p.asParentOf} 之上
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex min-w-min justify-center">
              <div className="flex flex-nowrap items-start justify-center gap-4">
                {(data.pendingSiblings || []).map((s) => (
                  <PersonCard
                    key={s.id}
                    p={s}
                    focusId={data.focus.id}
                    reviewingIds={reviewingIds}
                    canEdit={canEdit}
                    onOpen={setDrawerId}
                    onOpenPending={openPending}
                    onContextMenu={onNodeContextMenu}
                  />
                ))}
                {data.tree ? (
                  <TreeBranch
                    node={data.tree}
                    focusId={data.focus.id}
                    reviewingIds={reviewingIds}
                    canEdit={canEdit}
                    onOpen={setDrawerId}
                    onOpenPending={openPending}
                    onContextMenu={onNodeContextMenu}
                    onReorderChildren={onReorderChildren}
                  />
                ) : (
                  <PersonCard
                    p={data.focus}
                    focusId={data.focus.id}
                    reviewingIds={reviewingIds}
                    canEdit={canEdit}
                    onOpen={setDrawerId}
                    onOpenPending={openPending}
                    onContextMenu={onNodeContextMenu}
                  />
                )}
              </div>
            </div>

            <div className="mt-8 text-center text-xs text-muted">
              宽谱展示：各代同父兄弟及其分支一并画出 · 可滚动 · 右上角可缩放 · 金色为当前人物
            </div>
          </ChartZoomViewport>
        </Card>
      ) : null}

      {pendingReorder ? (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-card">
          <span className="text-sm text-ink">
            已调整长幼顺序（最左为长），确认后提交审核
          </span>
          <Button
            variant="secondary"
            disabled={reorderBusy}
            onClick={() => {
              setPendingReorder(null);
              load();
            }}
          >
            撤销
          </Button>
          <Button disabled={reorderBusy} onClick={submitReorder}>
            确认提交
          </Button>
        </div>
      ) : null}

      {menu ? (
        <LineageContextMenu
          x={menu.x}
          y={menu.y}
          name={menu.name}
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
          onClose={() => setAddDlg(null)}
          onSaved={() => load()}
        />
      ) : null}

      {drawerId != null ? (
        <PersonNodeDrawer
          personId={drawerId}
          canEdit={canEdit}
          focusHref={`/people/${drawerId}/lineage${depthQs}`}
          onClose={() => setDrawerId(null)}
          onSaved={() => load()}
        />
      ) : null}
    </div>
  );
}

export default function LineagePage() {
  return (
    <Suspense fallback={<div className="text-muted">加载中...</div>}>
      <LineageInner />
    </Suspense>
  );
}
