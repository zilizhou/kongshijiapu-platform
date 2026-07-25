"use client";

import { ReactNode } from "react";
import { formatBeforeValue, isFieldChanged } from "@/lib/diff";
import type { BranchPayload } from "@/lib/types";
import { Input, Select } from "./ui";

function Field({
  label,
  required,
  children,
  className = "",
  changed,
  beforeText,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  changed?: boolean;
  beforeText?: string;
}) {
  return (
    <div
      className={`${className} ${
        changed
          ? "rounded-lg bg-amber-50/80 ring-2 ring-amber-400/70 -m-1.5 p-1.5"
          : ""
      }`}
    >
      <label className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink">
        <span className="inline-flex items-center gap-0.5">
          {required ? <span className="text-accent">*</span> : null}
          {label}
        </span>
        {changed ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
            已修改
          </span>
        ) : null}
      </label>
      {children}
      {changed && beforeText != null ? (
        <div className="mt-1 text-xs text-amber-900/70">
          原值：{beforeText}
        </div>
      ) : null}
    </div>
  );
}

export type BranchParentOpt = { id: number; name: string; fullName: string };

export function BranchForm({
  value,
  onChange,
  disabled,
  compareWith,
  parents = [],
  lockParent,
  parentName,
}: {
  value: BranchPayload;
  onChange: (v: BranchPayload) => void;
  disabled?: boolean;
  compareWith?: BranchPayload | null;
  parents?: BranchParentOpt[];
  /** 编辑时不改上级 */
  lockParent?: boolean;
  parentName?: string | null;
}) {
  const set = <K extends keyof BranchPayload>(key: K, v: BranchPayload[K]) =>
    onChange({ ...value, [key]: v });

  const mark = (key: keyof BranchPayload) => {
    const changed = isFieldChanged(
      compareWith as Record<string, unknown> | null | undefined,
      value as unknown as Record<string, unknown>,
      key,
    );
    return {
      changed,
      beforeText: changed
        ? formatBeforeValue(
            (compareWith as Record<string, unknown> | null | undefined)?.[key],
          )
        : undefined,
    };
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="派户支名称" required {...mark("name")}>
        <Input
          disabled={disabled}
          value={value.name || ""}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="上级派户支" {...mark("parentId")}>
        {lockParent ? (
          <Input value={parentName || "无（顶级）"} disabled />
        ) : (
          <Select
            disabled={disabled}
            value={value.parentId ?? ""}
            onChange={(e) =>
              set("parentId", e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">无（顶级）</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="全称" className="md:col-span-2" {...mark("fullName")}>
        <Input
          disabled={disabled}
          value={value.fullName || ""}
          placeholder="可留空，保存时按上级自动拼接"
          onChange={(e) => set("fullName", e.target.value)}
        />
      </Field>
      <Field label="世代" {...mark("level")}>
        <Input
          disabled={disabled}
          type="number"
          value={value.level ?? ""}
          onChange={(e) =>
            set("level", e.target.value === "" ? null : Number(e.target.value))
          }
        />
      </Field>
      <Field label="始迁祖" {...mark("person")}>
        <Input
          disabled={disabled}
          value={value.person || ""}
          onChange={(e) => set("person", e.target.value)}
        />
      </Field>
      <Field label="册次" {...mark("book")}>
        <Input
          disabled={disabled}
          value={value.book || ""}
          onChange={(e) => set("book", e.target.value)}
        />
      </Field>
      <Field label="卷次" {...mark("volume")}>
        <Input
          disabled={disabled}
          value={value.volume || ""}
          onChange={(e) => set("volume", e.target.value)}
        />
      </Field>
      <Field label="备注" className="md:col-span-2" {...mark("remark")}>
        <Input
          disabled={disabled}
          value={value.remark || ""}
          onChange={(e) => set("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}

export const emptyBranchPayload = (): BranchPayload => ({
  name: "",
  fullName: "",
  parentId: null,
  book: "",
  person: "",
  volume: "",
  remark: "",
  level: null,
  personParentId: null,
  personParentName: "",
  personParentNo: "",
});
