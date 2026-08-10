"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { emptyPayload } from "@/components/PeopleForm";
import { BranchPicker } from "@/components/BranchPicker";
import { normalizePeopleRank } from "@/lib/people-client";
import {
  mergeStructuredPatch,
  parseStructuredPeopleText,
  parsedPersonToPayloadPatch,
  type ParsedPerson,
} from "@/lib/structured-people-text";
import type { PeoplePayload } from "@/lib/types";
import { Button, Textarea } from "./ui";

type CreatedInfo = {
  requestId: number;
  submitted: boolean;
};

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-ink">{value?.trim() || "-"}</dd>
    </div>
  );
}

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
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Record<number, CreatedInfo>>({});

  useEffect(() => {
    if (!open) return;
    setGroup(current.group || "");
  }, [open, current.group]);

  const preview = people[selected] ?? null;
  const createdInfo = preview ? created[preview.index] : undefined;

  const contextHint = useMemo(() => {
    const parts: string[] = [];
    if (current.parentId) parts.push(`当前父 ID ${current.parentId}`);
    if (current.level != null) parts.push(`${current.level} 世`);
    return parts.join(" · ");
  }, [current.parentId, current.level]);

  if (!open) return null;

  function reset() {
    setText("");
    setError("");
    setPeople([]);
    setSelected(0);
    setBusy(false);
    setCreated({});
    setGroup(current.group || "");
  }

  function runParse() {
    setError("");
    setCreated({});
    const list = parseStructuredPeopleText(text);
    if (!list.length) {
      setPeople([]);
      setError("未能解析出成员，请确认格式（如「1. 姓名」及「生年：…」）");
      return;
    }
    setPeople(list);
    setSelected(0);
  }

  function buildCreatePayload(person: ParsedPerson): PeoplePayload {
    const patch = parsedPersonToPayloadPatch(person);
    const base = emptyPayload();
    return normalizePeopleRank({
      ...base,
      ...patch,
      sex: (patch.sex as "男" | "女") || "男",
      group: group.trim(),
      parentId: current.parentId ?? null,
      level: current.level ?? null,
      originalData: current.originalData || "1",
    });
  }

  function applyFill() {
    if (!preview) {
      setError("请先解析并选择一位成员");
      return;
    }
    const patch = parsedPersonToPayloadPatch(preview);
    onApply(mergeStructuredPatch(current, patch));
    setError("");
  }

  async function createPerson(submit: boolean) {
    if (!preview) {
      setError("请先选择一位成员");
      return;
    }
    if (created[preview.index]) {
      setError("该成员已创建变更单，可点击单号继续编辑或提交");
      return;
    }
    if (!group.trim()) {
      setError("新增须填写所属派户支");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = buildCreatePayload(preview);
      if (!payload.name.trim()) throw new Error("姓名不能为空");
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "create",
          objectId: null,
          payload,
          submit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "创建变更单失败");
      const requestId = Number(data.item?.id);
      if (!requestId) throw new Error("创建成功但未返回单据号");
      setCreated((prev) => ({
        ...prev,
        [preview.index]: { requestId, submitted: submit },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">粘贴文本导入</h2>
            <p className="mt-1 text-xs text-muted">
              解析后点选成员查看详情；可填入当前表单，或直接新增生成编修变更单（走一/二/终审）。
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
          {!people.length ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  结构化文本
                </label>
                <Textarea
                  className="min-h-[220px] font-mono text-sm"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`示例：\n4. 令钧\n生年：1944年8月12日\n学历：中专　毕业学校：……\n妻：岳彩萍\n子女一：德浩\n现住址：……`}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={!text.trim()}
                onClick={runParse}
              >
                解析文本
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3 rounded border border-line bg-soft/40 px-3 py-2">
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-xs text-muted">
                    新增时使用的派户支（必填）
                  </label>
                  <BranchPicker
                    value={group}
                    onChange={setGroup}
                    placeholder="输入名称搜索派户支"
                  />
                </div>
                <div className="text-xs text-muted">
                  {contextHint || "未带入父亲/代数（可先从世系图「新增子女」进入）"}
                </div>
                <button
                  type="button"
                  className="text-xs text-accent"
                  onClick={() => {
                    setPeople([]);
                    setSelected(0);
                    setCreated({});
                    setError("");
                  }}
                >
                  重新粘贴
                </button>
              </div>

              <div className="grid min-h-[320px] gap-3 md:grid-cols-[14rem_1fr]">
                <div className="overflow-auto rounded border border-line">
                  <div className="border-b border-line px-2 py-1.5 text-xs text-muted">
                    共 {people.length} 人
                  </div>
                  <ul className="p-1">
                    {people.map((p, i) => {
                      const done = created[p.index];
                      return (
                        <li key={`${p.index}-${p.name}`}>
                          <button
                            type="button"
                            className={`block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-soft ${
                              selected === i
                                ? "bg-soft ring-1 ring-accent/40"
                                : ""
                            }`}
                            onClick={() => {
                              setSelected(i);
                              setError("");
                            }}
                          >
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted">
                              {p.birthday || p.spouse || "—"}
                              {done ? (
                                <span className="ml-1 text-ok">
                                  · 已建#{done.requestId}
                                </span>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="rounded border border-line p-4">
                  {preview ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-display text-lg text-ink">
                          {preview.name}
                        </h3>
                        <span className="text-xs text-muted">
                          拼音：
                          {parsedPersonToPayloadPatch(preview).pinyin || "-"}
                        </span>
                      </div>
                      <dl className="space-y-1.5">
                        <DetailRow label="性别" value={preview.sex} />
                        <DetailRow label="生年" value={preview.birthday} />
                        <DetailRow label="卒年" value={preview.deathday} />
                        <DetailRow label="学历" value={preview.degree} />
                        <DetailRow label="毕业学校" value={preview.college} />
                        <DetailRow label="工作单位" value={preview.company} />
                        <DetailRow label="联系电话" value={preview.phone} />
                        <DetailRow label="配偶" value={preview.spouse} />
                        <DetailRow
                          label="子女"
                          value={
                            preview.children.length
                              ? preview.children.join("；")
                              : ""
                          }
                        />
                        <DetailRow label="现住址" value={preview.address} />
                      </dl>

                      {createdInfo ? (
                        <div className="rounded border border-line bg-soft/50 px-3 py-2 text-sm">
                          已生成变更单{" "}
                          <Link
                            className="text-accent underline"
                            href={`/edit/${createdInfo.requestId}`}
                          >
                            #{createdInfo.requestId}
                          </Link>
                          {createdInfo.submitted
                            ? "（已提交审核）"
                            : "（暂存，可打开后继续编辑并提交）"}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-sm text-muted">请选择左侧成员</div>
                  )}
                </div>
              </div>
            </>
          )}

          {error ? <div className="text-sm text-danger">{error}</div> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            关闭
          </Button>
          {people.length ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={!preview || busy}
                onClick={applyFill}
              >
                填入当前表单
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!preview || busy || Boolean(createdInfo)}
                onClick={() => void createPerson(false)}
              >
                {busy ? "处理中…" : "新增（暂存）"}
              </Button>
              <Button
                type="button"
                disabled={!preview || busy || Boolean(createdInfo)}
                onClick={() => void createPerson(true)}
              >
                {busy ? "处理中…" : "新增并提交审核"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
