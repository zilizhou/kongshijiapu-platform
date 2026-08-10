"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type {
  FormOcrPreviewItem,
  FormOcrSheetMeta,
} from "@/lib/form-ocr-types";
import type { PeoplePayload } from "@/lib/types";
import { Button } from "./ui";

type ApplyResult = {
  name: string;
  ok: boolean;
  requestId?: number;
  error?: string;
};

function matchLabel(status: FormOcrPreviewItem["matchStatus"]) {
  if (status === "unique") return "唯一匹配（更新）";
  if (status === "ambiguous") return "重名待选";
  if (status === "none") return "未匹配（新建）";
  return status;
}

export function FormOcrDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<FormOcrSheetMeta | null>(null);
  const [items, setItems] = useState<FormOcrPreviewItem[]>([]);
  const [model, setModel] = useState("");
  const [submit, setSubmit] = useState(false);
  const [results, setResults] = useState<ApplyResult[] | null>(null);

  if (!open) return null;

  function resetAll() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setBusy(false);
    setError("");
    setSheet(null);
    setItems([]);
    setModel("");
    setResults(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPickFile(f: File | null) {
    setResults(null);
    setItems([]);
    setSheet(null);
    setError("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : "");
  }

  function updateItem(index: number, patch: Partial<FormOcrPreviewItem>) {
    setItems((prev) =>
      prev.map((it) => (it.index === index ? { ...it, ...patch } : it)),
    );
  }

  async function chooseCandidate(index: number, peopleId: number) {
    const item = items.find((x) => x.index === index);
    if (!item) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/people/${peopleId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载成员失败");
      const person = data.person || data.item || data;
      const merged: PeoplePayload = {
        ...item.payload,
        name: person.name || item.payload.name,
        sex: person.sex === "女" ? "女" : "男",
        level: person.level ?? item.payload.level,
        group: person.groupName || item.payload.group,
        parentId: person.parentId,
        no: person.no || item.payload.no,
        // 保留识别出的新字段
        alias: item.payload.alias || person.alias || "",
        birthday: item.payload.birthday || person.birthday || "",
        deathday: item.payload.deathday || person.deathday || "",
        phone: item.payload.phone || person.phone || "",
        address: item.payload.address || person.address || "",
        spouse: item.payload.spouse || person.spouse || "",
        company: item.payload.company || person.company || "",
        position: item.payload.position || person.position || "",
        professionalTitle:
          item.payload.professionalTitle || person.professionalTitle || "",
        college: item.payload.college || person.college || "",
        degree: item.payload.degree || person.degree || "",
        description: [person.description, item.payload.description]
          .filter(Boolean)
          .join("\n"),
      };
      updateItem(index, {
        matchedPeopleId: peopleId,
        matchStatus: "unique",
        operation: "update",
        selected: true,
        payload: merged,
        warning: undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "选择失败");
    } finally {
      setBusy(false);
    }
  }

  async function runRecognize() {
    if (!file) {
      setError("请先选择登记表图片");
      return;
    }
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/people/form-ocr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "识别失败");
      setSheet(data.sheet || null);
      setModel(data.model || "");
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "识别失败");
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    const selected = items.filter((x) => x.selected);
    if (!selected.length) {
      setError("请勾选要填入的成员");
      return;
    }
    for (const it of selected) {
      if (it.matchStatus === "ambiguous") {
        setError(`「${it.extracted.name}」仍有重名，请先选择对应成员`);
        return;
      }
      if (it.operation === "create" && !(it.payload.group || "").trim()) {
        setError(`「${it.extracted.name}」新建须填写派户支`);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/people/form-ocr/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit,
          items: selected.map((x) => ({
            operation: x.operation,
            peopleId: x.matchedPeopleId,
            payload: x.payload,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "填入失败");
      setResults(data.results || []);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "填入失败");
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = items.filter((x) => x.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">续修登记表识别填入</h2>
            <p className="mt-1 text-xs text-muted">
              上传《孔子世家谱常态化续修登记表》照片，识别后核对并生成编修变更单。
            </p>
          </div>
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={() => {
              resetAll();
              onClose();
            }}
          >
            关闭
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">登记表图片</label>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
              />
            </div>
            <Button
              variant="secondary"
              disabled={!file || busy}
              onClick={() => void runRecognize()}
            >
              {busy && !items.length ? "识别中…" : "开始识别"}
            </Button>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={submit}
                onChange={(e) => setSubmit(e.target.checked)}
              />
              填入后直接提交审核
            </label>
          </div>

          {previewUrl ? (
            <div className="overflow-auto rounded border border-line bg-soft/30 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="登记表预览"
                className="max-h-48 max-w-full object-contain"
              />
            </div>
          ) : null}

          {sheet ? (
            <div className="rounded border border-line bg-soft/40 px-3 py-2 text-xs text-muted">
              {sheet.branchText ? <div>派户支：{sheet.branchText}</div> : null}
              {sheet.fillerName || sheet.fillerPhone ? (
                <div>
                  填表人：{sheet.fillerName || "-"}
                  {sheet.fillerPhone ? `　${sheet.fillerPhone}` : ""}
                </div>
              ) : null}
              {model ? <div>识别模型：{model}</div> : null}
            </div>
          ) : null}

          {error ? <div className="text-sm text-danger">{error}</div> : null}

          {items.length ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  识别到 {items.length} 人，已选 {selectedCount} 人
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-accent"
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((x) => ({
                          ...x,
                          selected: x.matchStatus !== "ambiguous",
                        })),
                      )
                    }
                  >
                    全选可填
                  </button>
                  <button
                    type="button"
                    className="text-muted"
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((x) => ({ ...x, selected: false })),
                      )
                    }
                  >
                    清空选择
                  </button>
                </div>
              </div>

              {items.map((it) => (
                <div
                  key={it.index}
                  className="rounded border border-line p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <label className="mt-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={it.selected}
                        disabled={it.matchStatus === "ambiguous"}
                        onChange={(e) =>
                          updateItem(it.index, { selected: e.target.checked })
                        }
                      />
                      <span className="font-medium">{it.extracted.name}</span>
                    </label>
                    <span className="rounded bg-soft px-2 py-0.5 text-xs text-muted">
                      {matchLabel(it.matchStatus)}
                    </span>
                    {it.matchedPeopleId ? (
                      <span className="text-xs text-muted">
                        ID {it.matchedPeopleId}
                      </span>
                    ) : null}
                  </div>
                  {it.warning ? (
                    <div className="mt-1 text-xs text-warn">{it.warning}</div>
                  ) : null}
                  <div className="mt-2 grid gap-1 text-xs text-muted md:grid-cols-2">
                    <div>生年：{it.extracted.birthday || "-"}</div>
                    <div>电话：{it.extracted.phone || "-"}</div>
                    <div>配偶：{it.extracted.spouse || "-"}</div>
                    <div>学历：{it.extracted.degree || "-"}</div>
                    <div className="md:col-span-2">
                      单位：
                      {[
                        it.extracted.company,
                        it.extracted.position,
                        it.extracted.professionalTitle,
                      ]
                        .filter(Boolean)
                        .join(" / ") || "-"}
                    </div>
                    <div className="md:col-span-2">
                      住址：{it.extracted.address || "-"}
                    </div>
                    <div className="md:col-span-2">
                      子女：
                      {it.extracted.children?.length
                        ? it.extracted.children.join("、")
                        : "-"}
                    </div>
                  </div>

                  {it.matchStatus === "ambiguous" ? (
                    <div className="mt-2 space-y-1">
                      {it.candidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="block w-full rounded border border-line px-2 py-1.5 text-left text-xs hover:bg-soft"
                          disabled={busy}
                          onClick={() => void chooseCandidate(it.index, c.id)}
                        >
                          ID {c.id} · {c.level != null ? `${c.level}世` : "-"} ·{" "}
                          {c.groupName || "-"}
                          {c.parentName ? ` · 父:${c.parentName}` : ""}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {it.matchStatus === "none" ? (
                    <div className="mt-2">
                      <label className="text-xs text-muted">新建派户支</label>
                      <input
                        className="mt-1 w-full rounded border border-line px-2 py-1 text-sm"
                        value={it.payload.group || ""}
                        onChange={(e) =>
                          updateItem(it.index, {
                            payload: { ...it.payload, group: e.target.value },
                          })
                        }
                        placeholder="如：沂陽戶,零,零"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {results ? (
            <div className="rounded border border-line p-3 text-sm">
              <div className="font-medium">填入结果</div>
              <ul className="mt-2 space-y-1">
                {results.map((r, i) => (
                  <li key={`${r.name}-${i}`}>
                    {r.ok ? (
                      <span className="text-ok">
                        {r.name} → 变更单{" "}
                        {r.requestId ? (
                          <Link
                            className="underline"
                            href={`/edit/${r.requestId}`}
                          >
                            #{r.requestId}
                          </Link>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-danger">
                        {r.name}：{r.error}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button
            variant="secondary"
            onClick={() => {
              resetAll();
              onClose();
            }}
          >
            {results ? "完成" : "取消"}
          </Button>
          {!results ? (
            <Button
              disabled={!selectedCount || busy}
              onClick={() => void runApply()}
            >
              {busy ? "提交中…" : `确认填入（${selectedCount}）`}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
