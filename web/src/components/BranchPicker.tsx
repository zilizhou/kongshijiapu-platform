"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "./ui";

type Hit = {
  id: number;
  name: string;
  fullName: string;
};

export function BranchPicker({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (group: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(Boolean(value));
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelected(Boolean(value));
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({
          options: "1",
          pageSize: "20",
        });
        if (q.trim()) sp.set("q", q.trim());
        const res = await fetch(`/api/branches?${sp}`);
        const data = await res.json();
        setHits((data.items || []) as Hit[]);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  }

  const showSelected = selected && value && !keyword;

  return (
    <div ref={boxRef} className="relative">
      {showSelected ? (
        <div className="flex min-h-[34px] items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1">
          <span className="flex-1 truncate text-sm text-ink" title={value}>
            {value}
          </span>
          {!disabled ? (
            <button
              type="button"
              className="shrink-0 text-xs text-muted hover:text-accent"
              onClick={() => {
                onChange("");
                setSelected(false);
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
          placeholder={placeholder || "输入名称搜索派户支"}
          onChange={(e) => {
            const v = e.target.value;
            setKeyword(v);
            setSelected(false);
            search(v);
          }}
          onFocus={() => {
            if (!hits.length) search(keyword);
            else setOpen(true);
          }}
        />
      )}
      {open && !disabled ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white shadow-card">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted">搜索中...</div>
          ) : null}
          {!loading && !hits.length ? (
            <div className="px-3 py-2 text-xs text-muted">无匹配派户支</div>
          ) : null}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-soft"
              onClick={() => {
                const label = h.fullName || h.name;
                onChange(label);
                setSelected(true);
                setKeyword("");
                setOpen(false);
              }}
            >
              <div className="text-sm text-ink">{h.name}</div>
              {h.fullName && h.fullName !== h.name ? (
                <div className="truncate text-[11px] text-muted">{h.fullName}</div>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
