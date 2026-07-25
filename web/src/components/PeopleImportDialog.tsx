"use client";

import { useRef, useState } from "react";
import { Button } from "./ui";
import type { ImportRowResult } from "@/lib/people-import";

export function PeopleImportDialog({
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
  const [submit, setSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{
    okCount: number;
    failCount: number;
    results: ImportRowResult[];
  } | null>(null);

  if (!open) return null;

  async function downloadTemplate() {
    setError("");
    try {
      const res = await fetch("/api/people/import/template");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "下载失败");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "家谱成员导入模板.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败");
    }
  }

  async function runImport() {
    if (!file) {
      setError("请先选择 Excel 文件");
      return;
    }
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("submit", submit ? "1" : "0");
      const res = await fetch("/api/people/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.parseErrors
          ? data.parseErrors
              .map((x: { row: number; error: string }) => `第${x.row}行：${x.error}`)
              .join("；")
          : "";
        throw new Error(detail || data.error || "导入失败");
      }
      setSummary({
        okCount: data.okCount || 0,
        failCount: data.failCount || 0,
        results: data.results || [],
      });
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-line bg-panel shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="font-display text-lg text-ink">批量导入成员</div>
            <div className="mt-0.5 text-xs text-muted">
              先下载 Excel 模板填写，再上传；成功后进入编修/审核流程（非直接写入正式库）
            </div>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-muted hover:bg-soft"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="rounded-lg bg-soft px-3 py-3 text-xs leading-relaxed text-muted">
            <div className="mb-1 font-medium text-ink">填写说明</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>必填：姓名、性别（男/女）、所属派户支</li>
              <li>有父时填「当前父姓名」（须能唯一匹配到库中成员）</li>
              <li>是否出嗣 / 是否源自原始谱书：填「是」或「否」</li>
              <li>单次最多 200 行；请直接编辑下载的 .xlsx 后上传（勿另存为 CSV）</li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={downloadTemplate}>
              下载导入模板
            </Button>
            <span className="text-xs text-muted">
              Excel 模板（.xlsx）含表头、说明行与一行示例，可删改后上传
            </span>
          </div>

          <div>
            <div className="mb-1 text-xs text-muted">选择文件</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full text-sm"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setSummary(null);
              }}
            />
            {file ? (
              <div className="mt-1 text-xs text-muted">已选：{file.name}</div>
            ) : null}
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-accent"
              checked={submit}
              onChange={(e) => setSubmit(e.target.checked)}
            />
            导入后直接提交审核（不勾选则暂存到「我的编修」）
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          {summary ? (
            <div className="rounded-lg border border-line">
              <div className="border-b border-line px-3 py-2 text-sm">
                完成：成功{" "}
                <span className="font-medium text-ok">{summary.okCount}</span>{" "}
                行，失败{" "}
                <span className="font-medium text-danger">
                  {summary.failCount}
                </span>{" "}
                行
              </div>
              <div className="max-h-56 overflow-auto text-xs">
                <table className="min-w-full">
                  <thead className="bg-soft text-muted">
                    <tr>
                      <th className="px-3 py-1.5 text-left">行</th>
                      <th className="px-3 py-1.5 text-left">姓名</th>
                      <th className="px-3 py-1.5 text-left">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.results.map((r) => (
                      <tr key={`${r.row}-${r.name}`} className="border-t border-line/70">
                        <td className="px-3 py-1.5">{r.row}</td>
                        <td className="px-3 py-1.5">{r.name || "-"}</td>
                        <td className="px-3 py-1.5">
                          {r.ok ? (
                            <span className="text-ok">
                              成功
                              {r.requestId ? `（变更单 #${r.requestId}）` : ""}
                            </span>
                          ) : (
                            <span className="text-danger">{r.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {summary ? "完成" : "取消"}
          </Button>
          {!summary ? (
            <Button disabled={busy || !file} onClick={runImport}>
              {busy ? "导入中…" : "开始导入"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
