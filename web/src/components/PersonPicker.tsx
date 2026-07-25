"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "./ui";

type Hit = {
  id: number;
  name: string;
  sex: string;
  no: string | null;
  level: number | null;
  groupName: string | null;
};

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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!valueId) {
      setDisplayName("");
      return;
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

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({
          name: q.trim(),
          pageSize: "8",
          page: "1",
        });
        const res = await fetch(`/api/people?${sp}`);
        const data = await res.json();
        setHits((data.items || []) as Hit[]);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  return (
    <div ref={boxRef} className="relative">
      {valueId && displayName && !keyword ? (
        <div className="flex h-[38px] items-center gap-2 rounded-lg border border-line bg-white px-3">
          <span className="flex-1 truncate text-sm text-ink">{displayName}</span>
          {!disabled ? (
            <button
              type="button"
              className="text-xs text-muted hover:text-accent"
              onClick={() => {
                onChange(null);
                setDisplayName("");
                setKeyword("");
                setHits([]);
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
      {open && (hits.length || loading) ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white shadow-card">
          {loading ? (
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
              </div>
            </button>
          ))}
          {!loading && !hits.length ? (
            <div className="px-3 py-2 text-xs text-muted">无匹配人物</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
