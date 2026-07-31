"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

function compose(year: string, month: string, day: string, precision: Precision) {
  if (!year) return "";
  if (precision === "year") return year;
  if (!month) return year;
  if (precision === "month") return `${year}-${month}`;
  if (!day) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
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
  // 精度单独保存：仅有年份时字符串无法区分「仅年 / 年月 / 年月日」
  const [precision, setPrecision] = useState<Precision>(
    () => parseFlexible(value).precision,
  );
  const prevValue = useRef(value);

  useEffect(() => {
    if (value === prevValue.current) return;
    prevValue.current = value;
    if (!value) return;
    const next = parseFlexible(value);
    setPrecision((curr) => {
      const rank = { year: 0, month: 1, day: 2 } as const;
      // 字符串尚未含月/日时精度偏低，勿覆盖用户已选的「年月/年月日」
      if (rank[next.precision] < rank[curr]) return curr;
      return next.precision;
    });
  }, [value]);

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
      onChange(compose(year, "", "", "year"));
      return;
    }
    if (day) {
      const max =
        year && month ? new Date(Number(year), Number(month), 0).getDate() : 31;
      if (Number(day) > max) day = String(max).padStart(2, "0");
    }
    // 年月精度但尚未选月时，仍只存年份；精度靠本地 state 保留
    onChange(compose(year, month, day, nextPrecision));
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
            onClick={() => onChange("")}
            className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-soft"
          >
            清空
          </button>
        ) : null}
      </div>
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
      {value ? (
        <div className="text-xs text-muted">已选：{value}</div>
      ) : null}
    </div>
  );
}
