"use client";

import { ReactNode, useRef } from "react";
import { extractCourtesyFromDescription } from "@/lib/courtesy";
import { formatBeforeValue, isFieldChanged } from "@/lib/diff";
import { PeoplePayload } from "@/lib/types";
import { nameToPinyin } from "@/lib/pinyin";
import {
  parseRankToIndex,
  rankLabelSimplified,
} from "@/lib/zh";
import { FlexibleDateField } from "./FlexibleDateField";
import { BranchPicker } from "./BranchPicker";
import { PersonPicker } from "./PersonPicker";
import { RegionCascader } from "./RegionCascader";
import { Input, Textarea } from "./ui";

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

function RadioGroup({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex h-[38px] items-center gap-5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`inline-flex cursor-pointer items-center gap-1.5 text-sm ${
            disabled ? "opacity-60" : ""
          }`}
        >
          <input
            type="radio"
            className="accent-accent"
            disabled={disabled}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="col-span-full mt-2 border-t border-line pt-4 font-display text-base text-ink">
      {children}
    </div>
  );
}

export function PeopleForm({
  value,
  onChange,
  disabled,
  compareWith,
}: {
  value: PeoplePayload;
  onChange: (v: PeoplePayload) => void;
  disabled?: boolean;
  /** 修改前快照；有则高亮变更字段并展示原值 */
  compareWith?: PeoplePayload | null;
}) {
  const lastAutoPinyin = useRef("");
  const set = <K extends keyof PeoplePayload>(key: K, v: PeoplePayload[K]) =>
    onChange({ ...value, [key]: v });

  const mark = (key: keyof PeoplePayload) => {
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

  function onNameChange(name: string) {
    const auto = nameToPinyin(name);
    const current = value.pinyin || "";
    const shouldAuto =
      !current ||
      current === lastAutoPinyin.current ||
      current === nameToPinyin(value.name || "");
    lastAutoPinyin.current = auto;
    if (shouldAuto) {
      onChange({ ...value, name, pinyin: auto });
    } else {
      onChange({ ...value, name });
    }
  }

  return (
    <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
      {/* 必填项置顶 */}
      <Field label="姓名" required {...mark("name")}>
        <Input
          disabled={disabled}
          value={value.name || ""}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="请输入姓名"
        />
      </Field>
      <Field label="性别" required {...mark("sex")}>
        <RadioGroup
          disabled={disabled}
          value={value.sex || "男"}
          onChange={(v) => {
            const sex = v as "男" | "女";
            const idx =
              value.siblingOrder ?? parseRankToIndex(value.rank || "");
            if (idx != null) {
              onChange({
                ...value,
                sex,
                siblingOrder: idx,
                rank: rankLabelSimplified(sex, idx),
              });
            } else {
              set("sex", sex);
            }
          }}
          options={[
            { value: "男", label: "男" },
            { value: "女", label: "女" },
          ]}
        />
      </Field>

      <Field label="所属派户支" required {...mark("group")}>
        <BranchPicker
          disabled={disabled}
          value={value.group || ""}
          onChange={(group) => set("group", group)}
          placeholder="输入名称搜索派户支"
        />
      </Field>
      <Field label="当前父" required {...mark("parentId")}>
        <PersonPicker
          disabled={disabled}
          valueId={value.parentId}
          placeholder="输入姓名搜索当前父"
          onChange={(id) => set("parentId", id)}
        />
      </Field>

      <Field label="当前排行" required {...mark("rank")}>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            disabled={disabled}
            type="number"
            min={1}
            className="w-[88px]"
            value={
              value.siblingOrder != null
                ? value.siblingOrder + 1
                : (() => {
                    const idx = parseRankToIndex(value.rank || "");
                    return idx != null ? idx + 1 : "";
                  })()
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange({ ...value, rank: "", siblingOrder: null });
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n) || n < 1) return;
              const idx = Math.floor(n) - 1;
              const sex = value.sex === "女" ? "女" : "男";
              onChange({
                ...value,
                siblingOrder: idx,
                rank: rankLabelSimplified(sex, idx),
              });
            }}
            placeholder="序号"
            title="1=长子/长女，2=次子/次女…"
          />
          <span className="text-xs text-muted">↔</span>
          <Input
            disabled={disabled}
            className="min-w-[140px] flex-1"
            value={value.rank || ""}
            onChange={(e) => {
              const rank = e.target.value;
              const idx = parseRankToIndex(rank);
              if (idx != null) {
                onChange({ ...value, rank, siblingOrder: idx });
              } else {
                onChange({ ...value, rank, siblingOrder: null });
              }
            }}
            onBlur={() => {
              const idx =
                value.siblingOrder ?? parseRankToIndex(value.rank || "");
              if (idx == null) return;
              const sex = value.sex === "女" ? "女" : "男";
              const normalized = rankLabelSimplified(sex, idx);
              if (
                value.rank !== normalized ||
                value.siblingOrder !== idx
              ) {
                onChange({
                  ...value,
                  siblingOrder: idx,
                  rank: normalized,
                });
              }
            }}
            placeholder="如：长子、次子"
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          输入数字或排行会互相换算：1↔长子/长女，2↔次子/次女（也可在世系图拖拽调整）
        </p>
      </Field>
      <Field label="世代" {...mark("level")}>
        <Input
          disabled={disabled}
          type="number"
          value={value.level ?? ""}
          onChange={(e) =>
            set("level", e.target.value === "" ? null : Number(e.target.value))
          }
          placeholder="请输入世代"
        />
      </Field>

      {/* 证件号/谱号：暂隐藏，payload.no 仍保留 */}
      <Field label="姓名拼音" {...mark("pinyin")}>
        <Input
          disabled={disabled}
          value={value.pinyin || ""}
          onChange={(e) => {
            lastAutoPinyin.current = "";
            set("pinyin", e.target.value);
          }}
          placeholder="由姓名自动生成，可改"
        />
        <div className="mt-1 text-xs text-muted">输入姓名后自动填充拼音</div>
      </Field>
      <Field label="民族" {...mark("nation")}>
        <Input
          disabled={disabled}
          value={value.nation || ""}
          onChange={(e) => set("nation", e.target.value)}
          placeholder="如：汉"
        />
      </Field>

      <Field label="字" {...mark("zi")}>
        <Input
          disabled={disabled}
          value={value.zi || ""}
          onChange={(e) => set("zi", e.target.value)}
          placeholder="如：子上"
        />
      </Field>
      <Field label="号" {...mark("hao")}>
        <Input
          disabled={disabled}
          value={value.hao || ""}
          onChange={(e) => set("hao", e.target.value)}
          placeholder="如：存齋"
        />
        {!disabled && value.description ? (
          <button
            type="button"
            className="mt-1 text-xs text-accent hover:underline"
            onClick={() => {
              const { zi, hao } = extractCourtesyFromDescription(
                value.description,
              );
              if (zi) set("zi", zi);
              if (hao) set("hao", hao);
            }}
          >
            从描述信息提取字/号
          </button>
        ) : null}
      </Field>
      <Field label="别名" {...mark("alias")}>
        <Input
          disabled={disabled}
          value={value.alias || ""}
          onChange={(e) => set("alias", e.target.value)}
          placeholder="其他别名（不含字/号）"
        />
      </Field>
      <Field label="是否出嗣" {...mark("isHeir")}>
        <RadioGroup
          disabled={disabled}
          value={value.isHeir || "0"}
          onChange={(v) => set("isHeir", v as "0" | "1")}
          options={[
            { value: "0", label: "否" },
            { value: "1", label: "是" },
          ]}
        />
      </Field>

      <Field label="是否源自原始谱书" {...mark("originalData")}>
        <RadioGroup
          disabled={disabled}
          value={value.originalData || "1"}
          onChange={(v) => set("originalData", v as "0" | "1")}
          options={[
            { value: "0", label: "否" },
            { value: "1", label: "是" },
          ]}
        />
      </Field>
      <Field label="联系电话" {...mark("phone")}>
        <Input
          disabled={disabled}
          value={value.phone || ""}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="请输入联系电话"
        />
      </Field>

      <Field label="出生时间" {...mark("birthday")}>
        <FlexibleDateField
          disabled={disabled}
          value={value.birthday || ""}
          onChange={(v) => set("birthday", v)}
          placeholder="选择年份"
        />
      </Field>
      <Field label="卒年" {...mark("deathday")}>
        <FlexibleDateField
          disabled={disabled}
          value={value.deathday || ""}
          onChange={(v) => set("deathday", v)}
          placeholder="选择年份"
        />
      </Field>

      <Field label="住址或祖籍" {...mark("ancestralHome")}>
        <RegionCascader
          disabled={disabled}
          value={value.ancestralHome || ""}
          onChange={(v) => set("ancestralHome", v)}
        />
      </Field>
      <Field label="详细地址" {...mark("address")}>
        <Input
          disabled={disabled}
          value={value.address || ""}
          onChange={(e) => set("address", e.target.value)}
          placeholder="请输入详细地址"
        />
      </Field>

      <Field label="祖籍" {...mark("volume")}>
        <Input
          disabled={disabled}
          value={value.volume || ""}
          onChange={(e) => set("volume", e.target.value)}
          placeholder="祖籍 / 卷次信息"
        />
      </Field>
      <Field label="经纬度" {...mark("lngLat")}>
        <Input
          disabled={disabled}
          value={value.lngLat || ""}
          onChange={(e) => set("lngLat", e.target.value)}
          placeholder="有地址时再填写"
        />
      </Field>

      <Field label="原生父" {...mark("birthFatherId")}>
        <PersonPicker
          disabled={disabled}
          valueId={value.birthFatherId}
          placeholder="输入姓名搜索原生父"
          onChange={(id) => set("birthFatherId", id)}
        />
      </Field>
      <Field label="原生母姓名" {...mark("birthMother")}>
        <Input
          disabled={disabled}
          value={value.birthMother || ""}
          onChange={(e) => set("birthMother", e.target.value)}
          placeholder="请输入原生母姓名"
        />
      </Field>

      <Field label="当前母姓名" {...mark("currentMother")}>
        <Input
          disabled={disabled}
          value={value.currentMother || ""}
          onChange={(e) => set("currentMother", e.target.value)}
          placeholder="请输入当前母姓名"
        />
      </Field>
      <div className="hidden md:block" />

      <Field label="描述信息" className="md:col-span-2" {...mark("description")}>
        <Textarea
          disabled={disabled}
          rows={4}
          value={value.description || ""}
          onChange={(e) => set("description", e.target.value)}
          placeholder="小传、备注等描述信息"
        />
      </Field>

      <SectionTitle>配偶信息</SectionTitle>
      <Field label="配偶姓名" {...mark("spouse")}>
        <Input
          disabled={disabled}
          value={value.spouse || ""}
          onChange={(e) => set("spouse", e.target.value)}
          placeholder="请输入配偶姓名"
        />
      </Field>
      <div className="hidden md:block" />
      <Field label="配偶补充信息" className="md:col-span-2" {...mark("spouseInfo")}>
        <Textarea
          disabled={disabled}
          rows={3}
          value={value.spouseInfo || ""}
          onChange={(e) => set("spouseInfo", e.target.value)}
          placeholder="配偶籍贯、生卒等补充说明"
        />
      </Field>

      <SectionTitle>工作信息</SectionTitle>
      <Field label="工作单位" {...mark("company")}>
        <Input
          disabled={disabled}
          value={value.company || ""}
          onChange={(e) => set("company", e.target.value)}
        />
      </Field>
      <Field label="职位" {...mark("position")}>
        <Input
          disabled={disabled}
          value={value.position || ""}
          onChange={(e) => set("position", e.target.value)}
        />
      </Field>
      <Field label="职称" {...mark("professionalTitle")}>
        <Input
          disabled={disabled}
          value={value.professionalTitle || ""}
          onChange={(e) => set("professionalTitle", e.target.value)}
        />
      </Field>

      <SectionTitle>教育信息</SectionTitle>
      <Field label="毕业院校" {...mark("college")}>
        <Input
          disabled={disabled}
          value={value.college || ""}
          onChange={(e) => set("college", e.target.value)}
        />
      </Field>
      <Field label="学历" {...mark("degree")}>
        <Input
          disabled={disabled}
          value={value.degree || ""}
          onChange={(e) => set("degree", e.target.value)}
        />
      </Field>

      <SectionTitle>系统信息</SectionTitle>
      <Field label="录入时间" {...mark("createTime")}>
        <Input
          type="datetime-local"
          disabled={disabled}
          value={toDatetimeLocalValue(value.createTime || "")}
          onChange={(e) =>
            set("createTime", fromDatetimeLocalValue(e.target.value))
          }
        />
        <p className="mt-1 text-xs text-muted">
          可按实际补录时间修改；留空则新建时用当前时间。影响首页「年度成员增长」统计。
        </p>
      </Field>
    </div>
  );
}

/** datetime-local 用 YYYY-MM-DDTHH:mm */
function toDatetimeLocalValue(v: string): string {
  const s = (v || "").trim().replace(" ", "T");
  if (!s) return "";
  return s.slice(0, 16);
}

function fromDatetimeLocalValue(v: string): string {
  const s = (v || "").trim();
  if (!s) return "";
  return s.replace("T", " ") + (s.length === 16 ? ":00" : "");
}

export const emptyPayload = (): PeoplePayload => ({
  name: "",
  sex: "男",
  no: "",
  level: null,
  group: "",
  birthday: "",
  deathday: "",
  address: "",
  pinyin: "",
  alias: "",
  zi: "",
  hao: "",
  nation: "",
  isHeir: "0",
  originalData: "1",
  ancestralHome: "",
  lngLat: "",
  phone: "",
  parentId: null,
  asParentOf: null,
  birthFatherId: null,
  siblingOrder: null,
  birthMother: "",
  currentMother: "",
  rank: "",
  spouse: "",
  spouseInfo: "",
  description: "",
  volume: "",
  company: "",
  position: "",
  professionalTitle: "",
  college: "",
  degree: "",
  createTime: defaultCreateTime(),
  sourceDaikaoId: null,
});

function defaultCreateTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
