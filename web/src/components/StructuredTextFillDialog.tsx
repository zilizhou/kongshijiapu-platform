"use client";

import Link from "next/link";
import { useState } from "react";
import { emptyPayload, PeopleForm } from "@/components/PeopleForm";
import { normalizePeopleRank } from "@/lib/people-client";
import {
  parseStructuredPeopleText,
  parsedPersonToPayloadPatch,
  type ParsedPerson,
} from "@/lib/structured-people-text";
import type { PeoplePayload } from "@/lib/types";
import type { PeopleScope } from "@/lib/people-scope";
import { objectTypeOf } from "@/lib/people-scope";
import { Button, Textarea } from "./ui";

type CreatedInfo = {
  requestId: number;
  submitted: boolean;
};

function buildPayloadFromParsed(person: ParsedPerson): PeoplePayload {
  const patch = parsedPersonToPayloadPatch(person);
  return normalizePeopleRank({
    ...emptyPayload(),
    ...patch,
    sex: (patch.sex as "男" | "女") || "男",
    originalData: "1",
  });
}

export function StructuredTextFillDialog({
  open,
  onClose,
  onDone,
  scope = "people",
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  scope?: PeopleScope;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [people, setPeople] = useState<ParsedPerson[]>([]);
  const [selected, setSelected] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, PeoplePayload>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Record<number, CreatedInfo>>({});

  const preview = people[selected] ?? null;
  const draft =
    preview != null ? drafts[preview.index] ?? buildPayloadFromParsed(preview) : null;
  const createdInfo = preview ? created[preview.index] : undefined;

  if (!open) return null;

  function reset() {
    setText("");
    setError("");
    setPeople([]);
    setSelected(0);
    setDrafts({});
    setBusy(false);
    setCreated({});
  }

  function ensureDraft(person: ParsedPerson, map: Record<number, PeoplePayload>) {
    if (map[person.index]) return map;
    return { ...map, [person.index]: buildPayloadFromParsed(person) };
  }

  function runParse() {
    setError("");
    setCreated({});
    const list = parseStructuredPeopleText(text);
    if (!list.length) {
      setPeople([]);
      setDrafts({});
      setError("未能解析出成员，请确认格式（如「1. 姓名」及「生年：…」）");
      return;
    }
    const nextDrafts: Record<number, PeoplePayload> = {};
    for (const p of list) {
      nextDrafts[p.index] = buildPayloadFromParsed(p);
    }
    setPeople(list);
    setDrafts(nextDrafts);
    setSelected(0);
  }

  function selectPerson(i: number) {
    const person = people[i];
    if (!person) return;
    setSelected(i);
    setError("");
    setDrafts((prev) => ensureDraft(person, prev));
  }

  async function createPerson(submit: boolean) {
    if (!preview || !draft) {
      setError("请先选择一位成员");
      return;
    }
    if (created[preview.index]) {
      setError("该成员已创建变更单，可点击单号继续编辑或提交");
      return;
    }
    if (!draft.name?.trim()) {
      setError("请填写姓名");
      return;
    }
    if (!draft.group?.trim()) {
      setError("请填写所属派户支");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = normalizePeopleRank(draft);
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "create",
          objectType: objectTypeOf(scope),
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
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {scope === "daikao" ? "粘贴文本导入待考成员" : "粘贴文本导入"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {scope === "daikao"
                ? "解析后点选成员，父亲在待考库匹配；生成待考编修变更单（走一/二/终审后写入待考库）。"
                : "解析后点选成员，在右侧表单核对/修改后新增，生成编修变更单（走一/二/终审）。"}
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

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
          {!people.length ? (
            <div className="space-y-4 overflow-y-auto">
              <div>
                <label className="mb-1 block text-xs text-muted">
                  结构化文本
                </label>
                <Textarea
                  className="min-h-[240px] font-mono text-sm"
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
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>已解析 {people.length} 人，点选后可在右侧编辑表单</span>
                <button
                  type="button"
                  className="text-accent"
                  onClick={() => {
                    setPeople([]);
                    setSelected(0);
                    setDrafts({});
                    setCreated({});
                    setError("");
                  }}
                >
                  重新粘贴
                </button>
              </div>

              <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[14rem_1fr]">
                <div className="min-h-0 overflow-auto rounded border border-line">
                  <div className="sticky top-0 border-b border-line bg-white px-2 py-1.5 text-xs text-muted">
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
                            onClick={() => selectPerson(i)}
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

                <div className="min-h-0 overflow-auto rounded border border-line p-4">
                  {draft ? (
                    <div className="space-y-3">
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
                      <PeopleForm
                        value={draft}
                        disabled={Boolean(createdInfo)}
                        scope={scope}
                        onChange={(next) => {
                          if (!preview) return;
                          setDrafts((prev) => ({
                            ...prev,
                            [preview.index]: next,
                          }));
                        }}
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-muted">请选择左侧成员</div>
                  )}
                </div>
              </div>
            </div>
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
