"use client";

import { ReactNode } from "react";
import { formatBeforeValue, isFieldChanged } from "@/lib/diff";
import { Input, Select, Textarea } from "@/components/ui";

export type DaikaoFormValue = {
  name: string;
  spectrumNo: string;
  generation: string;
  generationLabel: string;
  group1: string;
  group2: string;
  group3: string;
  childrenSample: string;
  childrenWithNo: string;
  outHeirs: string;
  description: string;
  sex: string;
  spouse: string;
  address: string;
  volume: string;
  sectionPath: string;
  parentName: string;
  parentNo: string;
  isRoot: boolean;
  isOutHeir: boolean;
};

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

export function DaikaoForm({
  value,
  onChange,
  disabled,
  compareWith,
}: {
  value: DaikaoFormValue;
  onChange: (v: DaikaoFormValue) => void;
  disabled?: boolean;
  /** 修改前快照；有则高亮变更字段并展示原值 */
  compareWith?: DaikaoFormValue | null;
}) {
  const set = <K extends keyof DaikaoFormValue>(key: K, v: DaikaoFormValue[K]) =>
    onChange({ ...value, [key]: v });

  const mark = (key: keyof DaikaoFormValue) => {
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
    <div className="grid grid-cols-2 gap-3">
      <Field label="姓名" required {...mark("name")}>
        <Input
          disabled={disabled}
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="谱号" {...mark("spectrumNo")}>
        <Input
          disabled={disabled}
          value={value.spectrumNo}
          onChange={(e) => set("spectrumNo", e.target.value)}
        />
      </Field>
      <Field label="性别" {...mark("sex")}>
        <Select
          disabled={disabled}
          value={value.sex}
          onChange={(e) => set("sex", e.target.value)}
        >
          <option value="男">男</option>
          <option value="女">女</option>
        </Select>
      </Field>
      <Field label="代数（数字）" {...mark("generation")}>
        <Input
          disabled={disabled}
          value={value.generation}
          onChange={(e) => set("generation", e.target.value)}
          placeholder="70"
        />
      </Field>
      <Field label="代数（原文）" {...mark("generationLabel")}>
        <Input
          disabled={disabled}
          value={value.generationLabel}
          onChange={(e) => set("generationLabel", e.target.value)}
          placeholder="七十代"
        />
      </Field>
      <Field label="配偶" {...mark("spouse")}>
        <Input
          disabled={disabled}
          value={value.spouse}
          onChange={(e) => set("spouse", e.target.value)}
        />
      </Field>
      <Field label="派1" {...mark("group1")}>
        <Input
          disabled={disabled}
          value={value.group1}
          onChange={(e) => set("group1", e.target.value)}
        />
      </Field>
      <Field label="派2" {...mark("group2")}>
        <Input
          disabled={disabled}
          value={value.group2}
          onChange={(e) => set("group2", e.target.value)}
        />
      </Field>
      <Field label="派3" {...mark("group3")}>
        <Input
          disabled={disabled}
          value={value.group3}
          onChange={(e) => set("group3", e.target.value)}
        />
      </Field>
      <Field label="父名" {...mark("parentName")}>
        <Input
          disabled={disabled}
          value={value.parentName}
          onChange={(e) => set("parentName", e.target.value)}
        />
      </Field>
      <Field label="父谱号" {...mark("parentNo")}>
        <Input
          disabled={disabled}
          value={value.parentNo}
          onChange={(e) => set("parentNo", e.target.value)}
        />
      </Field>
      <Field label="小节路径" className="col-span-2" {...mark("sectionPath")}>
        <Input
          disabled={disabled}
          value={value.sectionPath}
          onChange={(e) => set("sectionPath", e.target.value)}
        />
      </Field>
      <Field label="卷册" className="col-span-2" {...mark("volume")}>
        <Input
          disabled={disabled}
          value={value.volume}
          onChange={(e) => set("volume", e.target.value)}
        />
      </Field>
      <Field label="住址" className="col-span-2" {...mark("address")}>
        <Input
          disabled={disabled}
          value={value.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </Field>
      <Field label="子嗣摘要" className="col-span-2" {...mark("childrenSample")}>
        <Input
          disabled={disabled}
          value={value.childrenSample}
          onChange={(e) => set("childrenSample", e.target.value)}
        />
      </Field>
      <Field label="子嗣带号" className="col-span-2" {...mark("childrenWithNo")}>
        <Input
          disabled={disabled}
          value={value.childrenWithNo}
          onChange={(e) => set("childrenWithNo", e.target.value)}
        />
      </Field>
      <Field label="出嗣" className="col-span-2" {...mark("outHeirs")}>
        <Input
          disabled={disabled}
          value={value.outHeirs}
          onChange={(e) => set("outHeirs", e.target.value)}
        />
      </Field>
      <Field label="小传" className="col-span-2" {...mark("description")}>
        <Textarea
          disabled={disabled}
          rows={4}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <Field label="支根" {...mark("isRoot")}>
        <label className="inline-flex h-[38px] items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.isRoot}
            onChange={(e) => set("isRoot", e.target.checked)}
          />
          是支根
        </label>
      </Field>
      <Field label="出嗣相关" {...mark("isOutHeir")}>
        <label className="inline-flex h-[38px] items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.isOutHeir}
            onChange={(e) => set("isOutHeir", e.target.checked)}
          />
          是
        </label>
      </Field>
    </div>
  );
}
