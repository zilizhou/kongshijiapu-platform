"use client";

import { useCallback, useEffect, useState } from "react";
import { DaikaoForm, DaikaoFormValue } from "@/components/DaikaoForm";
import { PaginationBar } from "@/components/PaginationBar";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  TableScroll,
  tableHeadClass,
} from "@/components/ui";
import type { DaikaoRow, DaikaoUpdatePayload, SessionUser } from "@/lib/types";

function dash(v: string | number | null | undefined) {
  if (v == null || String(v).trim() === "") return "-";
  return String(v);
}

function canEditRole(role: string | undefined) {
  return ["first", "second", "final", "admin"].includes(role || "");
}

function rowToForm(p: DaikaoRow): DaikaoFormValue {
  return {
    name: p.name || "",
    spectrumNo: p.spectrumNo || "",
    generation: p.generation != null ? String(p.generation) : "",
    generationLabel: p.generationLabel || "",
    group1: p.group1 || "",
    group2: p.group2 || "",
    group3: p.group3 || "",
    childrenSample: p.childrenSample || "",
    childrenWithNo: p.childrenWithNo || "",
    outHeirs: p.outHeirs || "",
    description: p.description || "",
    sex: p.sex || "男",
    spouse: p.spouse || "",
    address: p.address || "",
    volume: p.volume || "",
    sectionPath: p.sectionPath || "",
    parentName: p.parentName || "",
    parentNo: p.parentNo || "",
    isRoot: p.isRoot,
    isOutHeir: p.isOutHeir,
  };
}

function formToPayload(f: DaikaoFormValue): DaikaoUpdatePayload {
  return {
    name: f.name.trim(),
    spectrumNo: f.spectrumNo.trim() || null,
    generation: f.generation.trim() ? Number(f.generation) : null,
    generationLabel: f.generationLabel.trim() || null,
    group1: f.group1.trim() || null,
    group2: f.group2.trim() || null,
    group3: f.group3.trim() || null,
    childrenSample: f.childrenSample.trim() || null,
    childrenWithNo: f.childrenWithNo.trim() || null,
    outHeirs: f.outHeirs.trim() || null,
    description: f.description,
    sex: f.sex || "男",
    spouse: f.spouse.trim() || null,
    address: f.address.trim() || null,
    volume: f.volume.trim() || null,
    sectionPath: f.sectionPath.trim() || null,
    parentName: f.parentName.trim() || null,
    parentNo: f.parentNo.trim() || null,
    isRoot: f.isRoot,
    isOutHeir: f.isOutHeir,
  };
}

export default function DaikaoPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [no, setNo] = useState("");
  const [level, setLevel] = useState("");
  const [group, setGroup] = useState("");
  const [sourceFile, setSourceFile] = useState("");
  const [volume, setVolume] = useState("");
  const [applied, setApplied] = useState({
    name: "",
    no: "",
    level: "",
    group: "",
    sourceFile: "",
    volume: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<DaikaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [detail, setDetail] = useState<DaikaoRow | null>(null);
  const [children, setChildren] = useState<DaikaoRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DaikaoFormValue | null>(null);
  /** 进入编辑时的库内原值，用于高亮对照 */
  const [baseline, setBaseline] = useState<DaikaoFormValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const canEdit = canEditRole(user?.role);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const sp = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (applied.name) sp.set("name", applied.name);
    if (applied.no) sp.set("no", applied.no);
    if (applied.level) sp.set("level", applied.level);
    if (applied.group) sp.set("group", applied.group);
    if (applied.sourceFile) sp.set("sourceFile", applied.sourceFile);
    if (applied.volume) sp.set("volume", applied.volume);
    try {
      const res = await fetch(`/api/daikao?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查询失败");
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, applied]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function search() {
    setPage(1);
    setApplied({ name, no, level, group, sourceFile, volume });
  }

  function reset() {
    setName("");
    setNo("");
    setLevel("");
    setGroup("");
    setSourceFile("");
    setVolume("");
    setPage(1);
    setApplied({
      name: "",
      no: "",
      level: "",
      group: "",
      sourceFile: "",
      volume: "",
    });
  }

  async function openDetail(row: DaikaoRow, edit = false) {
    setDetailLoading(true);
    setError("");
    setEditing(false);
    setForm(null);
    setBaseline(null);
    try {
      const res = await fetch(`/api/daikao/${row.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      const person = data.person as DaikaoRow;
      const snap = rowToForm(person);
      setDetail(person);
      setChildren(data.children || []);
      setForm(snap);
      setBaseline({ ...snap });
      setEditing(edit && canEdit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setChildren([]);
    setEditing(false);
    setForm(null);
    setBaseline(null);
  }

  function startEdit() {
    if (!detail) return;
    const snap = rowToForm(detail);
    setBaseline({ ...snap });
    setForm(snap);
    setEditing(true);
  }

  function cancelEdit() {
    if (!baseline) return;
    setForm({ ...baseline });
    setEditing(false);
  }

  async function save() {
    if (!detail || !form) return;
    if (!form.name.trim()) {
      setError("姓名不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/daikao/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      const person = data.person as DaikaoRow;
      const snap = rowToForm(person);
      setDetail(person);
      setForm(snap);
      setBaseline(snap);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="待考管理"
        desc={
          canEdit
            ? "浏览待考支人员；一审/二审/终审/管理员可直接编辑。修改字段相对原值琥珀色高亮对照。"
            : "浏览待考支人员；录入员仅可查看，不可编辑。"
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label>姓名</Label>
            <Input
              clearable
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="姓名"
            />
          </div>
          <div>
            <Label>谱号</Label>
            <Input
              clearable
              value={no}
              onChange={(e) => setNo(e.target.value)}
              placeholder="如 002222"
            />
          </div>
          <div>
            <Label>代数</Label>
            <Input
              clearable
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="如 70"
            />
          </div>
          <div>
            <Label>派户支/小节</Label>
            <Input
              clearable
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="失敘 / 德州 / 亳州"
            />
          </div>
          <div>
            <Label>来源</Label>
            <Select
              value={sourceFile}
              onChange={(e) => setSourceFile(e.target.value)}
            >
              <option value="">全部</option>
              <option value="待攷支一">待攷支一</option>
              <option value="待攷支二">待攷支二</option>
            </Select>
          </div>
          <div>
            <Label>卷册</Label>
            <Input
              clearable
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder="四集卷一"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={search}>查询</Button>
          <Button variant="secondary" onClick={reset}>
            重置
          </Button>
        </div>
      </Card>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm text-muted">
          <span>
            共 {total} 人
            {loading ? " · 加载中…" : ""}
          </span>
          <div className="flex items-center gap-2">
            <span>每页</span>
            <Select
              className="w-20"
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <TableScroll>
          <table className="min-w-full text-left text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-3 py-2">姓名</th>
                <th className="px-3 py-2">谱号</th>
                <th className="px-3 py-2">代数</th>
                <th className="px-3 py-2">派户支</th>
                <th className="px-3 py-2">小节</th>
                <th className="px-3 py-2">卷册</th>
                <th className="px-3 py-2">来源</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-line/70 hover:bg-soft/60">
                  <td className="px-3 py-2 font-medium text-ink">
                    {p.name}
                    {p.isRoot ? (
                      <span className="ml-1 text-[11px] text-amber-700">根</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{dash(p.spectrumNo)}</td>
                  <td className="px-3 py-2">
                    {dash(p.generationLabel || p.generation)}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2" title={p.groupRaw || ""}>
                    {dash(p.groupRaw)}
                  </td>
                  <td
                    className="max-w-[160px] truncate px-3 py-2"
                    title={p.sectionPath || ""}
                  >
                    {dash(p.sectionPath)}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2" title={p.volume || ""}>
                    {dash(p.volume)}
                  </td>
                  <td className="px-3 py-2 text-muted">{p.sourceFile}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded bg-stone-600 px-2 py-0.5 text-xs text-white"
                        onClick={() => openDetail(p, false)}
                      >
                        查看
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          className="rounded bg-accent px-2 py-0.5 text-xs text-white"
                          onClick={() => openDetail(p, true)}
                        >
                          编辑
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    暂无数据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableScroll>

        <PaginationBar
          page={page}
          totalPages={pages}
          onChange={setPage}
          leading={`共 ${total} 人`}
        />
      </Card>

      {detail && form ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="flex h-full w-full max-w-xl flex-col bg-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="font-display text-lg text-ink">
                  {detail.name}
                  <span className="ml-2 text-sm font-sans text-muted">
                    #{detail.id}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {detail.sourceFile} · 行 {detail.sourceLine}
                  {detailLoading ? " · 加载中…" : ""}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-muted hover:bg-soft"
                onClick={closeDetail}
              >
                关闭
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!canEdit ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  当前为录入员，仅可浏览，不可保存修改。
                </div>
              ) : null}
              {editing ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900/80">
                  琥珀色高亮字段为相对库中原值的修改；下方「原值」可对照。
                </div>
              ) : null}

              <DaikaoForm
                value={form}
                onChange={setForm}
                disabled={!editing}
                compareWith={editing ? baseline : null}
              />

              {children.length ? (
                <div>
                  <div className="mb-2 text-sm font-medium text-ink">
                    子嗣（{children.length}）
                  </div>
                  <div className="rounded-lg border border-line">
                    {children.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center justify-between border-b border-line/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-soft"
                        onClick={() => openDetail(c, false)}
                      >
                        <span>
                          {c.name}
                          <span className="ml-2 text-muted">
                            {dash(c.spectrumNo)}
                          </span>
                        </span>
                        <span className="text-xs text-muted">
                          {dash(c.generationLabel || c.generation)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <Button variant="secondary" onClick={closeDetail}>
                关闭
              </Button>
              {canEdit && !editing ? (
                <Button onClick={startEdit}>编辑</Button>
              ) : null}
              {canEdit && editing ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={cancelEdit}
                  >
                    取消
                  </Button>
                  <Button disabled={saving} onClick={save}>
                    {saving ? "保存中…" : "保存"}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
