"use client";

import { useState } from "react";
import type { PeoplePayload } from "@/lib/types";
import {
  mergeStructuredPatch,
  parseStructuredPeopleText,
  parsedPersonToPayloadPatch,
  type ParsedPerson,
} from "@/lib/structured-people-text";
import { Button, Textarea } from "./ui";

export function StructuredTextFillDialog({
  open,
  onClose,
  current,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  current: PeoplePayload;
  onApply: (next: PeoplePayload) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [people, setPeople] = useState<ParsedPerson[]>([]);
  const [selected, setSelected] = useState(0);

  if (!open) return null;

  function reset() {
    setText("");
    setError("");
    setPeople([]);
    setSelected(0);
  }

  function runParse() {
    setError("");
    const list = parseStructuredPeopleText(text);
    if (!list.length) {
      setPeople([]);
      setError("未能解析出成员，请确认格式（如「1. 姓名」及「生年：…」）");
      return;
    }
    setPeople(list);
    setSelected(0);
  }

  function applyFill() {
    const person = people[selected];
    if (!person) {
      setError("请先解析并选择一位成员");
      return;
    }
    const patch = parsedPersonToPayloadPatch(person);
    onApply(mergeStructuredPatch(current, patch));
    reset();
    onClose();
  }

  const preview = people[selected];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">粘贴文本填入</h2>
            <p className="mt-1 text-xs text-muted">
              粘贴结构化续修文本，解析后选择一人填入当前表单（不改动父亲/派户支/代数）。
            </p>
          </div>
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            关闭
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs text-muted">结构化文本</label>
            <Textarea
              className="min-h-[200px] font-mono text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`示例：\n4. 令钧\n生年：1944年8月12日\n学历：中专　毕业学校：……\n妻：岳彩萍\n子女一：德浩\n现住址：……`}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!text.trim()}
              onClick={runParse}
            >
              解析
            </Button>
          </div>

          {error ? <div className="text-sm text-danger">{error}</div> : null}

          {people.length ? (
            <div className="space-y-3">
              <div className="text-sm text-muted">
                解析到 {people.length} 人，请选择要填入的一位：
              </div>
              <div className="max-h-48 space-y-1 overflow-auto rounded border border-line p-2">
                {people.map((p, i) => (
                  <button
                    key={`${p.index}-${p.name}`}
                    type="button"
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-soft ${
                      selected === i ? "bg-soft ring-1 ring-accent/40" : ""
                    }`}
                    onClick={() => setSelected(i)}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted">
                      {p.birthday ? ` · 生${p.birthday}` : ""}
                      {p.spouse ? ` · 配偶${p.spouse}` : ""}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </span>
                  </button>
                ))}
              </div>

              {preview ? (
                <div className="rounded border border-line bg-soft/40 px-3 py-2 text-xs text-muted">
                  <div className="font-medium text-ink">预览：{preview.name}</div>
                  <div className="mt-1 grid gap-0.5 md:grid-cols-2">
                    <div>性别：{preview.sex || "-"}</div>
                    <div>生年：{preview.birthday || "-"}</div>
                    <div>卒年：{preview.deathday || "-"}</div>
                    <div>电话：{preview.phone || "-"}</div>
                    <div>配偶：{preview.spouse || "-"}</div>
                    <div>学历：{preview.degree || "-"}</div>
                    <div className="md:col-span-2">
                      单位：{preview.company || "-"}
                    </div>
                    <div className="md:col-span-2">
                      住址：{preview.address || "-"}
                    </div>
                    <div className="md:col-span-2">
                      子女：
                      {preview.children.length
                        ? preview.children.join("；")
                        : "-"}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!people.length}
            onClick={applyFill}
          >
            填入表单
          </Button>
        </div>
      </div>
    </div>
  );
}
