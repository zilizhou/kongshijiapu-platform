"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "./ui";
import type { PeopleScope } from "@/lib/people-scope";

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
  /** 允许把输入词直接作为模糊条件（如只知「某戶」不知支） */
  allowFuzzyText = false,
  scope = "people",
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (group: string) => void;
  allowFuzzyText?: boolean;
  scope?: PeopleScope;
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
        const url =
          scope === "daikao"
            ? `/api/daikao/groups?${sp}`
            : `/api/branches?${sp}`;
        const res = await fetch(url);
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

  function commit(label: string) {
    const v = label.trim();
    if (!v) return;
    onChange(v);
    setSelected(true);
    setKeyword("");
    setOpen(false);
  }

  const showSelected = selected && value && !keyword;
  const fuzzyLabel = keyword.trim();

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
          placeholder={
            placeholder ||
            (allowFuzzyText ? "输入户/支名，可模糊匹配" : "输入名称搜索派户支")
          }
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
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !allowFuzzyText) return;
            e.preventDefault();
            if (fuzzyLabel) commit(fuzzyLabel);
          }}
        />
      )}
      {open && !disabled ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white shadow-card">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted">搜索中...</div>
          ) : null}
          {allowFuzzyText && fuzzyLabel ? (
            <button
              type="button"
              className="block w-full border-b border-line px-3 py-2 text-left hover:bg-soft"
              onClick={() => commit(fuzzyLabel)}
            >
              <div className="text-sm text-accent">模糊匹配「{fuzzyLabel}」</div>
              <div className="text-[11px] text-muted">
                包含该派/户/支名称的成员都会查出（不知具体支时用这个）
              </div>
            </button>
          ) : null}
          {!loading && !hits.length && !(allowFuzzyText && fuzzyLabel) ? (
            <div className="px-3 py-2 text-xs text-muted">无匹配派户支</div>
          ) : null}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-soft"
              onClick={() => commit(h.fullName || h.name)}
            >
              <div className="text-sm text-ink">{h.name}</div>
              {h.fullName && h.fullName !== h.name ? (
                <div className="truncate text-[11px] text-muted">
                  {h.fullName}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
