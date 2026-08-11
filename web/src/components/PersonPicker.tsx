"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "./ui";

interface Hit {
  id: number;
  name: string;
  sex: string;
  no: string | null;
  level: number | null;
  groupName: string | null;
  parentName?: string | null;
}

const PAGE_SIZE = 100;

function looksLikeChineseName(q: string): boolean {
  const t = q.trim();
  return t.length >= 2 && /^[\u4e00-\u9fff·•]+$/.test(t);
}

export function PersonPicker({
  valueId,
  disabled,
  placeholder,
  onChange,
}: {
  valueId: number | null | undefined;
  disabled?: boolean;
  placeholder?: string;
  onChange: (id: number | null) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (valueId == null || valueId === 0) {
      setDisplayName("");
      return;
    }

    // 图上链式新增：parentId = -变更单ID；需从变更单取姓名展示
    if (valueId < 0) {
      const reqId = Math.abs(valueId);
      fetch(`/api/requests/${reqId}`)
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || "加载关联父节点失败");
          return d;
        })
        .then((d) => {
          if (cancelled) return;
          const name =
            (d.item?.payload as { name?: string } | undefined)?.name ||
            `变更单#${reqId}`;
          const status = String(d.item?.status || "");
          const objectId = d.item?.objectId != null ? Number(d.item.objectId) : 0;
          if (status === "approved" && objectId > 0) {
            // 仅展示姓名；正 ID 升格由详情 hydrate 完成，避免此处 onChange 误标 dirty
            setDisplayName(name);
            setKeyword("");
            return;
          }
          const statusHint =
            status === "approved"
              ? "已通过"
              : status.startsWith("pending")
                ? "待审"
                : status === "draft"
                  ? "暂存"
                  : status || "关联";
          setDisplayName(`${name}（${statusHint} #${reqId}）`);
          setKeyword("");
        })
        .catch(() => {
          if (!cancelled) setDisplayName(`待审关联 #${reqId}`);
        });
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/people/${valueId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.person) return;
        setDisplayName(d.person.name || "");
        setKeyword("");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [valueId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function fetchPage(q: string, nextPage: number, append: boolean) {
    const seq = ++searchSeq.current;
    setLoading(true);
    try {
      const trimmed = q.trim();
      const sp = new URLSearchParams({
        name: trimmed,
        pageSize: String(PAGE_SIZE),
        page: String(nextPage),
      });
      // 完整汉字名：精确匹配，避免前缀把同名挤出前几页
      if (looksLikeChineseName(trimmed)) {
        sp.set("exactName", "1");
      }
      const res = await fetch(`/api/people?${sp}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "搜索失败");
      if (seq !== searchSeq.current) return;
      const items = (data.items || []) as Hit[];
      setTotal(Number(data.total || 0));
      setPage(nextPage);
      setHits((prev) => (append ? [...prev, ...items] : items));
      setOpen(true);
    } catch {
      if (seq !== searchSeq.current) return;
      if (!append) {
        setHits([]);
        setTotal(0);
      }
      setOpen(true);
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setHits([]);
      setTotal(0);
      setPage(1);
      return;
    }
    timer.current = setTimeout(() => {
      void fetchPage(q, 1, false);
    }, 250);
  }

  const showSelected = valueId != null && valueId !== 0 && displayName && !keyword;
  const canLoadMore = hits.length < total;

  return (
    <div ref={boxRef} className="relative">
      {showSelected ? (
        <div className="flex h-[38px] items-center gap-2 rounded-lg border border-line bg-white px-3">
          <span className="flex-1 truncate text-sm text-ink" title={displayName}>
            {displayName}
          </span>
          {!disabled ? (
            <button
              type="button"
              className="text-xs text-muted hover:text-accent"
              onClick={() => {
                onChange(null);
                setDisplayName("");
                setKeyword("");
                setHits([]);
                setTotal(0);
              }}
            >
              清除
            </button>
          ) : null}
        </div>
      ) : (
        <Input
          clearable
          disabled={disabled}
          value={keyword}
          placeholder={placeholder || "输入姓名搜索"}
          onChange={(e) => {
            const v = e.target.value;
            setKeyword(v);
            search(v);
          }}
          onFocus={() => {
            if (hits.length) setOpen(true);
          }}
        />
      )}
      {open && (hits.length || loading || total > 0) ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white shadow-card">
          {!loading && total > 0 ? (
            <div className="sticky top-0 border-b border-line bg-white px-3 py-1.5 text-[11px] text-muted">
              共 {total} 人
              {looksLikeChineseName(keyword) ? "（精确姓名）" : ""}
              {hits.length < total ? `，已显示 ${hits.length}` : ""}
            </div>
          ) : null}
          {loading && !hits.length ? (
            <div className="px-3 py-2 text-xs text-muted">搜索中...</div>
          ) : null}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-soft"
              onClick={() => {
                onChange(h.id);
                setDisplayName(h.name);
                setKeyword("");
                setOpen(false);
              }}
            >
              <div className="text-sm text-ink">{h.name}</div>
              <div className="text-[11px] text-muted">
                {h.sex}
                {h.level != null ? ` · 第${h.level}世` : ""}
                {h.groupName ? ` · ${h.groupName}` : ""}
                {h.parentName ? ` · 父:${h.parentName}` : ""}
                {` · #${h.id}`}
              </div>
            </button>
          ))}
          {canLoadMore ? (
            <button
              type="button"
              className="block w-full border-t border-line px-3 py-2 text-center text-xs text-accent hover:bg-soft"
              disabled={loading}
              onClick={() => void fetchPage(keyword, page + 1, true)}
            >
              {loading ? "加载中…" : `加载更多（还有 ${total - hits.length} 人）`}
            </button>
          ) : null}
          {!loading && !hits.length ? (
            <div className="px-3 py-2 text-xs text-muted">无匹配人物</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
