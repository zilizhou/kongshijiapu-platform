"use client";

import { ReactNode, useRef } from "react";
import { extractCourtesyFromDescription } from "@/lib/courtesy";
import { formatBeforeValue, isFieldChanged } from "@/lib/diff";
import { PeoplePayload } from "@/lib/types";
import { nameToPinyin } from "@/lib/pinyin";
import type { PeopleScope } from "@/lib/people-scope";
import {
  parseRankGender,
  parseRankToIndex,
  rankLabelSimplified,
} from "@/lib/zh";
import { parseIdCardProfile } from "@/lib/id-card";
import { peopleFeeStatusLabel } from "@/lib/people-fee";
import { FlexibleDateField } from "./FlexibleDateField";
import { BranchPicker } from "./BranchPicker";
import { PersonPicker } from "./PersonPicker";
import { PhoneListField } from "./PhoneListField";
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
  scope = "people",
  personId,
}: {
  value: PeoplePayload;
  onChange: (v: PeoplePayload) => void;
  disabled?: boolean;
  /** 修改前快照；有则高亮变更字段并展示原值 */
  compareWith?: PeoplePayload | null;
  /** 待考支表单：选人/派户支只搜待考库 */
  scope?: PeopleScope;
  /** 已落库人员：改缴费立即直写，不进三审 */
  personId?: number | null;
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

  function onIdCardChange(raw: string) {
    const parsed = parseIdCardProfile(raw);
    if (!parsed) {
      set("idCard", raw);
      return;
    }
    const sex = parsed.sex;
    const idx = value.siblingOrder ?? parseRankToIndex(value.rank || "");
    onChange({
      ...value,
      idCard: raw,
      sex,
      birthday: parsed.birthday,
      ...(idx != null
        ? { siblingOrder: idx, rank: rankLabelSimplified(sex, idx) }
        : {}),
    });
  }

  const showFeeStatus =
    scope !== "daikao" &&
    (value.feeStatus === "paid" ||
      value.feeStatus === "unpaid" ||
      !compareWith);

  function onFeeStatusChange(next: "paid" | "unpaid") {
    onChange({ ...value, feeStatus: next });
    if (!personId) return;
    void fetch(`/api/people/${personId}/fee`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeStatus: next }),
    }).then(async (res) => {
      if (res.ok) return;
      const data = await res.json().catch(() => ({}));
      alert(
        (data as { error?: string }).error || "更新缴费状态失败，请稍后重试",
      );
    });
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
      <Field label="身份证号码" {...mark("idCard")}>
        <Input
          disabled={disabled}
          value={value.idCard || ""}
          onChange={(e) => onIdCardChange(e.target.value)}
          placeholder="15 位或 18 位，末位可为 X"
          maxLength={18}
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
      {showFeeStatus ? (
        <Field
          label="缴费状态"
          changed={
            personId
              ? false
              : isFieldChanged(
                  compareWith as Record<string, unknown> | null | undefined,
                  value as unknown as Record<string, unknown>,
                  "feeStatus",
                )
          }
          beforeText={
            personId
              ? undefined
              : isFieldChanged(
                  compareWith as Record<string, unknown> | null | undefined,
                  value as unknown as Record<string, unknown>,
                  "feeStatus",
                )
                ? peopleFeeStatusLabel(
                    compareWith?.feeStatus === "paid" ? "paid" : "unpaid",
                  )
                : undefined
          }
        >
          <RadioGroup
            disabled={disabled && !personId}
            value={value.feeStatus === "paid" ? "paid" : "unpaid"}
            onChange={(v) => onFeeStatusChange(v === "paid" ? "paid" : "unpaid")}
            options={[
              { value: "unpaid", label: "未收费" },
              { value: "paid", label: "已交费" },
            ]}
          />
        </Field>
      ) : null}

      <Field label="所属派户支" required {...mark("group")}>
        <BranchPicker
          disabled={disabled}
          value={value.group || ""}
          onChange={(group) => set("group", group)}
          placeholder={
            scope === "daikao"
              ? "输入已有待考派户支或直接填写"
              : "输入名称搜索派户支"
          }
          scope={scope}
          allowFuzzyText={scope === "daikao"}
        />
      </Field>
      <Field label="当前父" required {...mark("parentId")}>
        <PersonPicker
          disabled={disabled}
          valueId={value.parentId}
          groupFilter={value.group || ""}
          placeholder={
            scope === "daikao"
              ? "输入姓名搜索待考库当前父"
              : "输入姓名搜索当前父"
          }
          onChange={(id) => set("parentId", id)}
          scope={scope}
        />
      </Field>

      <Field label="当前排行" required {...mark("rank")}>
        {(() => {
          const rankIdx =
            value.siblingOrder ?? parseRankToIndex(value.rank || "");
          const rankSex =
            parseRankGender(value.rank || "") ||
            (value.sex === "女" ? "女" : "男");
          // 有序号时文案不应为空：按性别显示长子/次女等
          const rankText =
            (value.rank || "").trim() ||
            (rankIdx != null ? rankLabelSimplified(rankSex, rankIdx) : "");
          return (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-12 shrink-0">
                  <Input
                    disabled={disabled}
                    inputMode="numeric"
                    className="px-1 text-center"
                    value={rankIdx != null ? String(rankIdx + 1) : ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (raw === "") {
                        onChange({ ...value, rank: "", siblingOrder: null });
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n) || n < 1) return;
                      const idx = Math.floor(n) - 1;
                      // 跟当前性别走：女→次女，男→次子
                      const sex = value.sex === "女" ? "女" : "男";
                      onChange({
                        ...value,
                        sex,
                        siblingOrder: idx,
                        rank: rankLabelSimplified(sex, idx),
                      });
                    }}
                    placeholder="2"
                    title="序号：1=长，2=次…"
                  />
                </div>
                <span className="shrink-0 select-none text-sm text-muted">
                  →
                </span>
                <span
                  className={`inline-flex h-[38px] min-w-[4.5rem] shrink-0 items-center justify-center rounded-lg border border-line px-2 text-sm ${
                    rankText ? "bg-soft text-ink" : "bg-white text-muted"
                  }`}
                  title="由序号与子/女自动生成"
                >
                  {rankText || "—"}
                </span>
                <div
                  className="inline-flex shrink-0 overflow-hidden rounded-lg border border-line"
                  title="选择子或女"
                >
                  {(
                    [
                      ["男", "子"],
                      ["女", "女"],
                    ] as const
                  ).map(([sexVal, label]) => {
                    const active = rankSex === sexVal;
                    return (
                      <button
                        key={sexVal}
                        type="button"
                        disabled={disabled || rankIdx == null}
                        className={`px-2.5 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? "bg-accent text-white"
                            : "bg-white text-ink hover:bg-soft"
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (rankIdx == null) return;
                          onChange({
                            ...value,
                            sex: sexVal,
                            siblingOrder: rankIdx,
                            rank: rankLabelSimplified(sexVal, rankIdx),
                          });
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted">
                输入序号后显示排行；性别为女时 2→次女，可点右侧切换子/女
              </p>
            </>
          );
        })()}
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
        <PhoneListField
          disabled={disabled}
          value={value.phone || ""}
          onChange={(v) => set("phone", v)}
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
          groupFilter={value.group || ""}
          placeholder={
            scope === "daikao"
              ? "输入姓名搜索待考库原生父"
              : "输入姓名搜索原生父"
          }
          onChange={(id) => set("birthFatherId", id)}
          scope={scope}
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
  idCard: "",
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
  feeStatus: "unpaid",
});

function defaultCreateTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
