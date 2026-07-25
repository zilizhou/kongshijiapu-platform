"use client";

import { regionData } from "element-china-area-data";
import { useMemo } from "react";
import { Input } from "./ui";

type Node = { value: string; label: string; children?: Node[] };

const selectCls =
  "w-full rounded-lg border border-line bg-white px-2 py-2 text-sm outline-none ring-accent/20 focus:border-accent focus:ring-2 disabled:opacity-50";

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
  // try match known labels
  const provinces = regionData as Node[];
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
  const provinces = regionData as Node[];

  const cities = useMemo(() => {
    const p = provinces.find((x) => x.label === parsed.province);
    return p?.children || [];
  }, [parsed.province, provinces]);

  const districts = useMemo(() => {
    const c = cities.find((x) => x.label === parsed.city);
    return c?.children || [];
  }, [cities, parsed.city]);

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
    onChange(bits.join(" / "));
  }

  return (
    <div className="space-y-2">
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
