"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { emptyPayload, PeopleForm } from "@/components/PeopleForm";
import { Button } from "@/components/ui";
import { PeoplePayload, PeopleRow } from "@/lib/types";

export type AddRelation = "parent" | "sibling" | "child";

const TITLE: Record<AddRelation, string> = {
  parent: "新增父节点",
  sibling: "新增兄弟节点",
  child: "新增子节点",
};

/** 树上已知的锚点信息，详情接口失败时用于回退建表单 */
export type AnchorSeed = {
  id: number;
  name: string;
  sex?: string;
  level?: number | null;
  parentId?: number | null;
  groupName?: string | null;
};

function buildPayload(relation: AddRelation, anchor: PeopleRow): PeoplePayload {
  const base = {
    ...emptyPayload(),
    group: anchor.groupName || "",
    originalData: "1" as const,
  };
  if (relation === "child") {
    return {
      ...base,
      parentId: anchor.id,
      level: anchor.level != null ? Number(anchor.level) + 1 : null,
    };
  }
  if (relation === "sibling") {
    return {
      ...base,
      parentId: anchor.parentId,
      level: anchor.level,
    };
  }
  return {
    ...base,
    parentId: anchor.parentId,
    asParentOf: anchor.id,
    level: anchor.level,
  };
}

function seedToRow(seed: AnchorSeed): PeopleRow {
  return {
    id: seed.id,
    name: seed.name,
    sex: seed.sex === "女" ? "女" : "男",
    no: null,
    level: seed.level ?? null,
    groupName: seed.groupName ?? null,
    birthday: null,
    deathday: null,
    address: null,
    pinyin: null,
    alias: null,
    isHeir: "0",
    originalData: "1",
    lngLat: null,
    parentId: seed.parentId ?? null,
    parentName: null,
    birthFatherId: null,
    spouse: null,
    spouseInfo: null,
    description: null,
    volume: null,
    phone: null,
    company: null,
    position: null,
    professionalTitle: null,
    college: null,
    degree: null,
    createTime: null,
    createAdmin: null,
    editTime: null,
  };
}

export function LineageAddDialog({
  relation,
  anchorId,
  anchorName,
  anchorSeed,
  onClose,
  onSaved,
}: {
  relation: AddRelation;
  anchorId: number;
  anchorName: string;
  /** 世系图上已有的锚点字段；接口失败时回退用 */
  anchorSeed?: AnchorSeed | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [payload, setPayload] = useState<PeoplePayload>(emptyPayload());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const applySeedFallback = useCallback(
    (reason: string) => {
      if (!anchorSeed) return false;
      // sibling 至少需要 parentId，否则无法挂到正确父亲下
      if (relation === "sibling" && (anchorSeed.parentId == null || !anchorSeed.parentId)) {
        return false;
      }
      setPayload(buildPayload(relation, seedToRow(anchorSeed)));
      setReady(true);
      setError(
        reason
          ? `${reason}，已用图上信息预填，请核对「所属派户支 / 当前父」。`
          : "",
      );
      return true;
    },
    [anchorSeed, relation],
  );

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    setSavedId(null);

    // 待审节点 ID 为 -变更单ID，无人物详情接口，直接用图上信息预填
    if (anchorId < 0) {
      if (!applySeedFallback("")) {
        setError(
          relation === "sibling"
            ? "该待审节点缺少同父信息，请改从父节点下新增子节点"
            : "无法准备表单",
        );
      } else {
        setError(
          `相对人物为待审新增（编修单 #${Math.abs(anchorId)}），请核对派户支与父节点；链式待审需按挂靠顺序终审。`,
        );
      }
      return;
    }

    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 15000);

    (async () => {
      try {
        const res = await fetch(`/api/people/${anchorId}`, {
          signal: ctrl.signal,
        });
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !d.person) {
          const msg =
            (d && d.error) ||
            (res.status === 401 ? "未登录或会话已过期" : `加载失败(${res.status})`);
          if (!applySeedFallback(msg)) setError(msg);
          return;
        }
        setPayload(buildPayload(relation, d.person as PeopleRow));
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof Error && e.name === "AbortError"
            ? "加载超时（数据库正忙）"
            : e instanceof Error
              ? e.message
              : "无法加载锚点人物";
        if (!applySeedFallback(msg)) setError(msg);
      } finally {
        window.clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [anchorId, relation, reloadKey, applySeedFallback]);

  async function save(submit: boolean) {
    if (!payload.name.trim()) {
      setError("请填写姓名");
      return;
    }
    if (!payload.group?.trim()) {
      setError("请填写所属派户支");
      return;
    }
    if (relation === "sibling" && !payload.parentId) {
      setError("缺少同父信息，请重试或改从父节点下新增子节点");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "create",
          objectId: null,
          payload,
          submit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setSavedId(data.item.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/30"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl text-ink">{TITLE[relation]}</h2>
            <p className="mt-1 text-xs text-muted">
              相对人物：{anchorName}
              {anchorId < 0
                ? `（待审编修单 #${Math.abs(anchorId)}）`
                : `（ID ${anchorId}）`}
              {relation === "parent"
                ? " · 终审通过后插入为其父节点"
                : relation === "sibling"
                  ? " · 与其同父"
                  : " · 挂为其子代"}
              {anchorId < 0
                ? "；链式待审需先终审通过被挂靠的节点"
                : ""}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {savedId ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-ink">已创建变更单 #{savedId}</p>
              <p className="text-sm text-muted">
                终审通过前会在世系图以「待审新增」色显示占位节点。
              </p>
              <Link href={`/edit/${savedId}`}>
                <Button>查看编修单</Button>
              </Link>
            </div>
          ) : ready ? (
            <PeopleForm value={payload} onChange={setPayload} />
          ) : (
            <div className="space-y-3 py-10 text-center">
              <div className="text-muted">准备表单...</div>
              {error ? (
                <div className="space-y-2">
                  <p className="text-sm text-danger">{error}</p>
                  <Button
                    variant="secondary"
                    onClick={() => setReloadKey((k) => k + 1)}
                  >
                    重试加载
                  </Button>
                </div>
              ) : null}
            </div>
          )}
          {error && ready ? (
            <p className="mt-4 text-sm text-accent">{error}</p>
          ) : null}
        </div>

        {!savedId ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-soft/40 px-5 py-4">
            <Button variant="secondary" disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button
              variant="secondary"
              disabled={saving || !ready}
              onClick={() => save(false)}
            >
              暂存
            </Button>
            <Button disabled={saving || !ready} onClick={() => save(true)}>
              确认提交
            </Button>
          </div>
        ) : (
          <div className="flex justify-end border-t border-line bg-soft/40 px-5 py-4">
            <Button variant="secondary" onClick={onClose}>
              继续看图
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const ALL_RELATIONS: { key: AddRelation; label: string }[] = [
  { key: "parent", label: "新增父节点" },
  { key: "sibling", label: "新增兄弟节点" },
  { key: "child", label: "新增子节点" },
];

export function LineageContextMenu({
  x,
  y,
  name,
  onClose,
  onSelect,
  relations,
}: {
  x: number;
  y: number;
  name: string;
  onClose: () => void;
  onSelect: (relation: AddRelation) => void;
  /** 可操作的关系类型；默认父/兄/子全部可选 */
  relations?: AddRelation[];
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // 下一帧再监听，避免打开菜单的同一次点击立刻关掉
    const t = window.setTimeout(() => {
      window.addEventListener("click", close);
    }, 0);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const allowed = relations?.length ? new Set(relations) : null;
  const items = ALL_RELATIONS.filter((item) =>
    allowed ? allowed.has(item.key) : true,
  );

  const left = Math.min(x, window.innerWidth - 180);
  const top = Math.min(y, window.innerHeight - 160);

  return (
    <div
      className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-card"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="border-b border-line px-3 py-1.5 text-xs text-muted">
        {name}
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-soft"
          onClick={() => {
            onSelect(item.key);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
