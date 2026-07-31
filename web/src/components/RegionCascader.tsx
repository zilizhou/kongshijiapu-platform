"use client";

import { regionData } from "element-china-area-data";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "./ui";

type RegionNode = { value: string; label: string; children?: RegionNode[] };

const selectCls =
  "w-full rounded-lg border border-line bg-white px-2 py-2 text-sm outline-none ring-accent/20 focus:border-accent focus:ring-2 disabled:opacity-50";

type RegionPath = {
  province: string;
  city: string;
  district: string;
  label: string;
};

let cachedPaths: RegionPath[] | null = null;

function allRegionPaths(): RegionPath[] {
  if (cachedPaths) return cachedPaths;
  const out: RegionPath[] = [];
  for (const p of regionData as RegionNode[]) {
    out.push({
      province: p.label,
      city: "",
      district: "",
      label: p.label,
    });
    for (const c of p.children || []) {
      out.push({
        province: p.label,
        city: c.label,
        district: "",
        label: `${p.label} / ${c.label}`,
      });
      for (const d of c.children || []) {
        out.push({
          province: p.label,
          city: c.label,
          district: d.label,
          label: `${p.label} / ${c.label} / ${d.label}`,
        });
      }
    }
  }
  cachedPaths = out;
  return out;
}

function splitValue(value: string): {
  province: string;
  city: string;
  district: string;
  extra: string;
} {
  const parts = (value || "")
    .split(/[/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const provinces = regionData as RegionNode[];
  let province = "";
  let city = "";
  let district = "";
  let rest = parts.slice();

  const pNode = provinces.find((p) => parts.includes(p.label));
  if (pNode) {
    province = pNode.label;
    rest = parts.filter((x) => x !== pNode.label);
    const cNode = (pNode.children || []).find((c) => parts.includes(c.label));
    if (cNode) {
      city = cNode.label;
      rest = rest.filter((x) => x !== cNode.label);
      const dNode = (cNode.children || []).find((d) => parts.includes(d.label));
      if (dNode) {
        district = dNode.label;
        rest = rest.filter((x) => x !== dNode.label);
      }
    }
  }
  return {
    province,
    city,
    district,
    extra: rest.join(" "),
  };
}

function searchRegions(q: string, limit = 12): RegionPath[] {
  const key = q.trim().toLowerCase().replace(/\s+/g, "");
  if (!key) return [];
  const paths = allRegionPaths();
  const scored: { path: RegionPath; score: number }[] = [];
  for (const path of paths) {
    const compact = path.label.replace(/\s*\/\s*/g, "").toLowerCase();
    const idx = compact.indexOf(key);
    if (idx < 0 && !path.label.toLowerCase().includes(q.trim().toLowerCase())) {
      continue;
    }
    let score = 0;
    if (path.district) score += 3;
    else if (path.city) score += 2;
    else score += 1;
    if (path.district.includes(q.trim()) || path.city.includes(q.trim())) {
      score += 5;
    }
    if (compact.startsWith(key) || path.label.startsWith(q.trim())) score += 4;
    else if (idx === 0) score += 2;
    scored.push({ path, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.label.length - b.path.label.length);
  return scored.slice(0, limit).map((x) => x.path);
}

export function RegionCascader({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const parsed = useMemo(() => splitValue(value), [value]);
  const provinces = regionData as RegionNode[];
  const [typed, setTyped] = useState(value || "");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const skipSync = useRef(false);

  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    setTyped(value || "");
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const cities = useMemo(() => {
    const p = provinces.find((x) => x.label === parsed.province);
    return p?.children || [];
  }, [parsed.province, provinces]);

  const districts = useMemo(() => {
    const c = cities.find((x) => x.label === parsed.city);
    return c?.children || [];
  }, [cities, parsed.city]);

  const suggestions = useMemo(() => {
    // 用输入中最后一个片段做联想（允许「山东省 历下」或整段）
    const q = typed.trim();
    if (!q) return [];
    const last = q.split(/[/\s]+/).filter(Boolean).pop() || q;
    return searchRegions(last.length >= 1 ? last : q);
  }, [typed]);

  function emit(next: {
    province?: string;
    city?: string;
    district?: string;
    extra?: string;
  }) {
    const province = next.province ?? parsed.province;
    const city = next.city ?? parsed.city;
    const district = next.district ?? parsed.district;
    const extra = (next.extra ?? parsed.extra).trim();
    const bits = [province, city, district].filter(Boolean);
    if (extra) bits.push(extra);
    const v = bits.join(" / ");
    skipSync.current = true;
    setTyped(v);
    onChange(v);
  }

  function applyPath(path: RegionPath, keepExtra = true) {
    const extra = keepExtra ? parsed.extra : "";
    const bits = [path.province, path.city, path.district].filter(Boolean);
    if (extra) bits.push(extra);
    const v = bits.join(" / ");
    skipSync.current = true;
    setTyped(v);
    onChange(v);
    setOpen(false);
  }

  function applyTypedAddress(raw: string) {
    const text = raw.trim();
    if (!text) {
      onChange("");
      return;
    }
    // 先尝试整段匹配省市区；剩余作文详
    const hits = searchRegions(text, 1);
    const best = hits[0];
    if (best && (text.includes(best.province) || text.includes(best.city) || text.includes(best.district))) {
      let extra = text
        .replace(best.province, " ")
        .replace(best.city, " ")
        .replace(best.district, " ")
        .replace(/[/\s]+/g, " ")
        .trim();
      const bits = [best.province, best.city, best.district].filter(Boolean);
      if (extra) bits.push(extra);
      const v = bits.join(" / ");
      skipSync.current = true;
      setTyped(v);
      onChange(v);
      return;
    }
    // 无法结构化时原样保存
    skipSync.current = true;
    setTyped(text);
    onChange(text);
  }

  const displayBits = [parsed.province, parsed.city, parsed.district]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="relative">
        <Input
          disabled={disabled}
          clearable
          value={typed}
          placeholder="也可直接输入地址，如 济南、历下区、山东省济南市"
          onChange={(e) => {
            const v = e.target.value;
            setTyped(v);
            setOpen(true);
          }}
          onFocus={() => {
            if (typed.trim()) setOpen(true);
          }}
          onBlur={() => {
            // 失焦时提交输入（结构化或原文）
            if (typed.trim() !== (value || "").trim()) {
              applyTypedAddress(typed);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (suggestions[0]) applyPath(suggestions[0], true);
              else applyTypedAddress(typed);
              setOpen(false);
            }
          }}
        />
        {open && typed.trim() && suggestions.length ? (
          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white shadow-card">
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-soft"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyPath(s, true)}
              >
                <div className="text-sm text-ink">{s.label}</div>
                <div className="text-[11px] text-muted">
                  {s.district ? "区县" : s.city ? "地市" : "省份"}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {displayBits || parsed.extra ? (
        <div className="text-xs text-muted">
          当前地址：
          {[displayBits, parsed.extra].filter(Boolean).join(" / ") || typed}
        </div>
      ) : typed.trim() ? (
        <div className="text-xs text-muted">将保存为：{typed.trim()}</div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <select
          disabled={disabled}
          className={selectCls}
          value={parsed.province}
          onChange={(e) =>
            emit({ province: e.target.value, city: "", district: "" })
          }
        >
          <option value="">省</option>
          {provinces.map((p) => (
            <option key={p.value} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          disabled={disabled || !parsed.province}
          className={selectCls}
          value={parsed.city}
          onChange={(e) => emit({ city: e.target.value, district: "" })}
        >
          <option value="">市</option>
          {cities.map((c) => (
            <option key={c.value} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          disabled={disabled || !parsed.city}
          className={selectCls}
          value={parsed.district}
          onChange={(e) => emit({ district: e.target.value })}
        >
          <option value="">区/县</option>
          {districts.map((d) => (
            <option key={d.value} value={d.label}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <Input
        disabled={disabled}
        value={parsed.extra}
        onChange={(e) => emit({ extra: e.target.value })}
        placeholder="可补充祖籍简述（选填）"
      />
    </div>
  );
}
