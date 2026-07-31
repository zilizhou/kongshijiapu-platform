"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "./ui";

type Precision = "year" | "month" | "day";

function parseFlexible(value: string): {
  year: string;
  month: string;
  day: string;
  precision: Precision;
} {
  const v = (value || "").trim();
  const m = v.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (!m) {
    return { year: "", month: "", day: "", precision: "year" };
  }
  const year = m[1];
  const month = m[2] ? m[2].padStart(2, "0") : "";
  const day = m[3] ? m[3].padStart(2, "0") : "";
  const precision: Precision = day ? "day" : month ? "month" : "year";
  return { year, month, day, precision };
}

/** 解析自由输入：1990、1990-5、19900501、1990年5月1日 等 */
function parseTypedDate(raw: string): {
  year: string;
  month: string;
  day: string;
  precision: Precision;
} | null {
  const v = raw.trim().replace(/[./]/g, "-");
  if (!v) return null;

  let m = v.match(
    /^(\d{4})\s*年\s*(?:(\d{1,2})\s*月\s*(?:(\d{1,2})\s*日?)?)?$/,
  );
  if (!m) m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) m = v.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) m = v.match(/^(\d{4})$/);
  if (!m) m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) m = v.match(/^(\d{4})(\d{2})$/);
  if (!m) return null;

  const year = m[1];
  const yNum = Number(year);
  if (yNum < 1 || yNum > new Date().getFullYear() + 1) return null;

  const monthRaw = m[2] || "";
  const dayRaw = m[3] || "";
  if (!monthRaw) {
    return { year, month: "", day: "", precision: "year" };
  }
  const monthNum = Number(monthRaw);
  if (monthNum < 1 || monthNum > 12) return null;
  const month = String(monthNum).padStart(2, "0");
  if (!dayRaw) {
    return { year, month, day: "", precision: "month" };
  }
  const dayNum = Number(dayRaw);
  const max = new Date(yNum, monthNum, 0).getDate();
  if (dayNum < 1 || dayNum > max) return null;
  return {
    year,
    month,
    day: String(dayNum).padStart(2, "0"),
    precision: "day",
  };
}

function compose(year: string, month: string, day: string, precision: Precision) {
  if (!year) return "";
  if (precision === "year") return year;
  if (!month) return year;
  if (precision === "month") return `${year}-${month}`;
  if (!day) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function formatDisplay(year: string, month: string, day: string, precision: Precision) {
  if (!year) return "";
  if (precision === "year" || !month) return `${year}年`;
  if (precision === "month" || !day) return `${year}年${Number(month)}月`;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function buildDateSuggestions(raw: string): string[] {
  const parsed = parseTypedDate(raw);
  if (!parsed?.year) return [];
  const out: string[] = [];
  const { year, month, day, precision } = parsed;
  if (precision === "year") {
    out.push(year);
    for (let i = 1; i <= 12; i++) {
      out.push(`${year}-${String(i).padStart(2, "0")}`);
    }
  } else if (precision === "month") {
    out.push(`${year}-${month}`);
    const max = new Date(Number(year), Number(month), 0).getDate();
    for (let i = 1; i <= Math.min(max, 31); i++) {
      out.push(`${year}-${month}-${String(i).padStart(2, "0")}`);
    }
  } else {
    out.push(`${year}-${month}-${day}`);
  }
  return out.slice(0, 16);
}

const selectCls =
  "rounded-lg border border-line bg-white px-2 py-2 text-sm outline-none ring-accent/20 focus:border-accent focus:ring-2 disabled:opacity-50";

export function FlexibleDateField({
  value,
  onChange,
  disabled,
  placeholder = "可选手动选择年月日",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const parsed = useMemo(() => parseFlexible(value), [value]);
  const [precision, setPrecision] = useState<Precision>(
    () => parseFlexible(value).precision,
  );
  const prevValue = useRef(value);
  const [typed, setTyped] = useState(value || "");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const skipSync = useRef(false);

  useEffect(() => {
    if (value === prevValue.current) return;
    prevValue.current = value;
    if (!skipSync.current) setTyped(value || "");
    skipSync.current = false;
    if (!value) return;
    const next = parseFlexible(value);
    setPrecision((curr) => {
      const rank = { year: 0, month: 1, day: 2 } as const;
      if (rank[next.precision] < rank[curr]) return curr;
      return next.precision;
    });
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const list: number[] = [];
    for (let y = now + 1; y >= 1; y--) list.push(y);
    return list;
  }, []);

  const daysInMonth = useMemo(() => {
    if (!parsed.year || !parsed.month) return 31;
    return new Date(Number(parsed.year), Number(parsed.month), 0).getDate();
  }, [parsed.year, parsed.month]);

  const typedParsed = useMemo(() => parseTypedDate(typed), [typed]);
  const suggestions = useMemo(() => buildDateSuggestions(typed), [typed]);

  function commitParsed(
    p: { year: string; month: string; day: string; precision: Precision },
  ) {
    setPrecision(p.precision);
    const next = compose(p.year, p.month, p.day, p.precision);
    skipSync.current = true;
    setTyped(next);
    onChange(next);
  }

  function update(next: {
    year?: string;
    month?: string;
    day?: string;
    precision?: Precision;
  }) {
    const year = next.year ?? parsed.year;
    const month = next.month ?? parsed.month;
    let day = next.day ?? parsed.day;
    const nextPrecision = next.precision ?? precision;
    if (next.precision) setPrecision(next.precision);
    if (nextPrecision !== "day") day = "";
    if (nextPrecision === "year") {
      const v = compose(year, "", "", "year");
      skipSync.current = true;
      setTyped(v);
      onChange(v);
      return;
    }
    if (day) {
      const max =
        year && month ? new Date(Number(year), Number(month), 0).getDate() : 31;
      if (Number(day) > max) day = String(max).padStart(2, "0");
    }
    const v = compose(year, month, day, nextPrecision);
    skipSync.current = true;
    setTyped(v);
    onChange(v);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["year", "仅年"],
            ["month", "年月"],
            ["day", "年月日"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => update({ precision: key })}
            className={`rounded-md px-2 py-1 text-xs transition ${
              precision === key
                ? "bg-accent text-white"
                : "border border-line bg-white text-muted hover:bg-soft"
            }`}
          >
            {label}
          </button>
        ))}
        {value ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setTyped("");
              onChange("");
            }}
            className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-soft"
          >
            清空
          </button>
        ) : null}
      </div>

      <div ref={boxRef} className="relative">
        <Input
          disabled={disabled}
          clearable
          value={typed}
          placeholder="也可直接输入，如 1990、1990-05、1990年5月1日"
          onChange={(e) => {
            const v = e.target.value;
            setTyped(v);
            setOpen(true);
            const p = parseTypedDate(v);
            if (p) {
              setPrecision(p.precision);
              skipSync.current = true;
              onChange(compose(p.year, p.month, p.day, p.precision));
            }
          }}
          onFocus={() => {
            if (typed.trim()) setOpen(true);
          }}
          onBlur={() => {
            // 失焦时若可解析则规范化展示
            const p = parseTypedDate(typed);
            if (p) commitParsed(p);
          }}
        />
        {open && typed.trim() && suggestions.length ? (
          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white shadow-card">
            {suggestions.map((s) => {
              const p = parseFlexible(s);
              return (
                <button
                  key={s}
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-soft"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    commitParsed(p);
                    setOpen(false);
                  }}
                >
                  <div className="text-sm text-ink">
                    {formatDisplay(p.year, p.month, p.day, p.precision)}
                  </div>
                  <div className="text-[11px] text-muted">{s}</div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {typedParsed ? (
        <div className="text-xs text-muted">
          识别为：
          {formatDisplay(
            typedParsed.year,
            typedParsed.month,
            typedParsed.day,
            typedParsed.precision,
          )}
          <span className="ml-1 text-muted/70">
           （{compose(
              typedParsed.year,
              typedParsed.month,
              typedParsed.day,
              typedParsed.precision,
            )}
            ）
          </span>
        </div>
      ) : typed.trim() ? (
        <div className="text-xs text-accent">未能识别日期，请检查格式</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <select
          disabled={disabled}
          className={`${selectCls} min-w-[96px]`}
          value={parsed.year}
          onChange={(e) => update({ year: e.target.value })}
        >
          <option value="">{placeholder}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}年
            </option>
          ))}
        </select>
        {precision !== "year" ? (
          <select
            disabled={disabled || !parsed.year}
            className={`${selectCls} min-w-[88px]`}
            value={parsed.month}
            onChange={(e) => update({ month: e.target.value })}
          >
            <option value="">月</option>
            {Array.from({ length: 12 }, (_, i) => {
              const m = String(i + 1).padStart(2, "0");
              return (
                <option key={m} value={m}>
                  {i + 1}月
                </option>
              );
            })}
          </select>
        ) : null}
        {precision === "day" ? (
          <select
            disabled={disabled || !parsed.year || !parsed.month}
            className={`${selectCls} min-w-[88px]`}
            value={parsed.day}
            onChange={(e) => update({ day: e.target.value })}
          >
            <option value="">日</option>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = String(i + 1).padStart(2, "0");
              return (
                <option key={d} value={d}>
                  {i + 1}日
                </option>
              );
            })}
          </select>
        ) : null}
      </div>
    </div>
  );
}
