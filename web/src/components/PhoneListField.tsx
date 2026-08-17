"use client";

import { KeyboardEvent, useState } from "react";
import {
  formatPhones,
  parsePhones,
  PEOPLE_PHONE_MAX_CHARS,
} from "@/lib/phone";
import { Input } from "./ui";

export function PhoneListField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const phones = parsePhones(value);
  const rows = disabled ? phones : [...phones, ""];
  const [hint, setHint] = useState("");

  function commit(next: string[]) {
    const joined = formatPhones(next);
    if (joined.length > PEOPLE_PHONE_MAX_CHARS) {
      setHint(
        `号码总长度不能超过 ${PEOPLE_PHONE_MAX_CHARS} 字（约 5 个手机号）`,
      );
      return false;
    }
    setHint("");
    onChange(joined);
    return true;
  }

  function updateAt(index: number, text: string) {
    const parts = parsePhones(text);
    const next = phones.slice();
    if (index >= phones.length) {
      commit([
        ...phones,
        ...(parts.length ? parts : text.trim() ? [text.trim()] : []),
      ]);
      return;
    }
    if (!text.trim()) {
      next.splice(index, 1);
      commit(next);
      return;
    }
    if (parts.length > 1) {
      next.splice(index, 1, ...parts);
    } else {
      next[index] = text;
    }
    commit(next);
  }

  function removeAt(index: number) {
    const next = phones.slice();
    next.splice(index, 1);
    commit(next);
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const text = (e.currentTarget.value || "").trim();
    if (!text) return;
    updateAt(index, text);
  }

  return (
    <div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-1 text-sm text-muted">无</p>
        ) : (
          rows.map((phone, index) => {
            const isExtra = index >= phones.length;
            return (
              <div key={index} className="flex gap-2">
                <Input
                  disabled={disabled}
                  value={phone}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={
                    isExtra && phones.length
                      ? "再填一个号码，回车添加"
                      : "请输入联系电话"
                  }
                  onChange={(e) => updateAt(index, e.target.value)}
                  onKeyDown={(e) => onKeyDown(index, e)}
                />
                {!disabled && !isExtra ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="删除该号码"
                    className="flex h-[38px] w-9 shrink-0 items-center justify-center rounded-lg border border-line text-lg leading-none text-ink/55 hover:bg-black/5 hover:text-ink"
                    onClick={() => removeAt(index)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <p className={`mt-1 text-xs ${hint ? "text-danger" : "text-muted"}`}>
        {hint ||
          "可填多个手机号或座机；一次粘贴时用顿号、逗号或分号分隔。最多约 5 个号码。"}
      </p>
    </div>
  );
}
