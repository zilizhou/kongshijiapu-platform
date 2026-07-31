"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DaikaoBatchAdmitDialog } from "@/components/DaikaoBatchAdmitDialog";
import { DaikaoForm, DaikaoFormValue } from "@/components/DaikaoForm";
import { PaginationBar } from "@/components/PaginationBar";
import {
  Button,
  Card,
  FilterBar,
  FilterField,
  Input,
  PageHeader,
  Select,
  TableScroll,
  tableHeadClass,
} from "@/components/ui";
import type {
  DaikaoAdmitStatus,
  DaikaoRow,
  DaikaoUpdatePayload,
  SessionUser,
} from "@/lib/types";

function dash(v: string | number | null | undefined) {
  if (v == null || String(v).trim() === "") return "-";
  return String(v);
}

function canEditRole(role: string | undefined) {
  return ["editor", "first", "second", "final", "admin"].includes(role || "");
}

function admitLabel(s: DaikaoAdmitStatus | undefined) {
  if (s === "pending") return "审核中";
  if (s === "admitted") return "已入谱";
  return "未入谱";
}

function AdmitPill({ status }: { status: DaikaoAdmitStatus | undefined }) {
  const s = status || "none";
  const cls =
    s === "admitted"
      ? "bg-emerald-50 text-emerald-800"
      : s === "pending"
        ? "bg-amber-50 text-amber-800"
        : "bg-stone-100 text-stone-600";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] ${cls}`}>
      {admitLabel(s)}
    </span>
  );
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
  const [admitStatus, setAdmitStatus] = useState("none");
  const [applied, setApplied] = useState({
    name: "",
    no: "",
    level: "",
    group: "",
    sourceFile: "",
    volume: "",
    admitStatus: "none",
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
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [batchOpen, setBatchOpen] = useState(false);

  const canEdit = canEditRole(user?.role);

  const selectableIds = useMemo(
    () =>
      items
        .filter((p) => !p.admitStatus || p.admitStatus === "none")
        .map((p) => p.id),
    [items],
  );
  const selectedIds = useMemo(
    () => selectableIds.filter((id) => selected[id]),
    [selectableIds, selected],
  );
  const allPageSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selected[id]);

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
    if (applied.admitStatus) sp.set("admitStatus", applied.admitStatus);
    try {
      const res = await fetch(`/api/daikao?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查询失败");
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSelected({});
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
    setApplied({ name, no, level, group, sourceFile, volume, admitStatus });
  }

  function reset() {
    setName("");
    setNo("");
    setLevel("");
    setGroup("");
    setSourceFile("");
    setVolume("");
    setAdmitStatus("none");
    setPage(1);
    setApplied({
      name: "",
      no: "",
      level: "",
      group: "",
      sourceFile: "",
      volume: "",
      admitStatus: "none",
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
            ? "浏览与编辑待考人员；确认无误后可「申请入谱」，走三审后进入正式家谱。"
            : "浏览待考支人员；当前账号仅可查看。"
        }
      />

      <FilterBar
        actions={
          <>
            <Button onClick={search}>查询</Button>
            <Button variant="secondary" onClick={reset}>
              重置
            </Button>
          </>
        }
      >
        <FilterField className="w-28">
          <Input
            compact
            clearable
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="姓名"
          />
        </FilterField>
        <FilterField className="w-28">
          <Input
            compact
            clearable
            value={no}
            onChange={(e) => setNo(e.target.value)}
            placeholder="谱号"
          />
        </FilterField>
        <FilterField className="w-24">
          <Input
            compact
            clearable
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="代数"
          />
        </FilterField>
        <FilterField className="w-40">
          <Input
            compact
            clearable
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="派户支/章节"
          />
        </FilterField>
        <FilterField className="w-28">
          <Select
            compact
            value={sourceFile}
            onChange={(e) => setSourceFile(e.target.value)}
          >
            <option value="">来源</option>
            <option value="待攷支一">待攷支一</option>
            <option value="待攷支二">待攷支二</option>
          </Select>
        </FilterField>
        <FilterField className="w-28">
          <Input
            compact
            clearable
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="卷册"
          />
        </FilterField>
        <FilterField className="w-28">
          <Select
            compact
            value={admitStatus}
            onChange={(e) => setAdmitStatus(e.target.value)}
          >
            <option value="none">未入谱</option>
            <option value="pending">审核中</option>
            <option value="admitted">已入谱</option>
            <option value="">全部状态</option>
          </Select>
        </FilterField>
      </FilterBar>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm text-muted">
          <span>
            共 {total} 人
            {loading ? " · 加载中…" : ""}
            {canEdit && selectedIds.length ? (
              <span className="ml-2 text-ink">
                · 已选 {selectedIds.length} 人（未入谱）
              </span>
            ) : null}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <Button
                disabled={!selectedIds.length}
                onClick={() => setBatchOpen(true)}
              >
                批量申请入谱
              </Button>
            ) : null}
          </div>
        </div>
        <TableScroll>
          <table className="min-w-full text-left text-sm">
            <thead className={tableHeadClass}>
              <tr>
                {canEdit ? (
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={allPageSelected}
                      disabled={!selectableIds.length}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setSelected((prev) => {
                          const next = { ...prev };
                          for (const id of selectableIds) {
                            if (on) next[id] = true;
                            else delete next[id];
                          }
                          return next;
                        });
                      }}
                      title="全选本页未入谱"
                    />
                  </th>
                ) : null}
                <th className="px-3 py-2">序号</th>
                <th className="px-3 py-2">姓名</th>
                <th className="px-3 py-2">谱号</th>
                <th className="px-3 py-2">代数</th>
                <th className="px-3 py-2">派户支</th>
                <th className="px-3 py-2">小节</th>
                <th className="px-3 py-2">卷册</th>
                <th className="px-3 py-2">来源</th>
                <th className="px-3 py-2">入谱</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, idx) => (
                <tr key={p.id} className="border-t border-line/70 hover:bg-soft/60">
                  {canEdit ? (
                    <td className="px-3 py-2">
                      {!p.admitStatus || p.admitStatus === "none" ? (
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={Boolean(selected[p.id])}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setSelected((prev) => {
                              const next = { ...prev };
                              if (on) next[p.id] = true;
                              else delete next[p.id];
                              return next;
                            });
                          }}
                        />
                      ) : (
                        <span className="inline-block w-4" />
                      )}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-muted">
                    {(page - 1) * pageSize + idx + 1}
                  </td>
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
                    <AdmitPill status={p.admitStatus} />
                  </td>
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
                      {canEdit && (!p.admitStatus || p.admitStatus === "none") ? (
                        <Link
                          href={`/edit/new?daikao=${p.id}`}
                          className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-white"
                        >
                          申请入谱
                        </Link>
                      ) : null}
                      {p.admitStatus === "pending" && p.admitRequestId ? (
                        <Link
                          href={`/edit/${p.admitRequestId}`}
                          className="rounded bg-amber-700 px-2 py-0.5 text-xs text-white"
                        >
                          变更单
                        </Link>
                      ) : null}
                      {p.admitStatus === "admitted" && p.admittedPeopleId ? (
                        <Link
                          href={`/people/${p.admittedPeopleId}/lineage`}
                          className="rounded bg-emerald-800 px-2 py-0.5 text-xs text-white"
                        >
                          正式#{p.admittedPeopleId}
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 11 : 10}
                    className="px-3 py-8 text-center text-muted"
                  >
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
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50]}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </Card>

      {detail && form ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/30"
          onClick={closeDetail}
        >
          <div
            className="flex h-full w-full max-w-xl flex-col bg-panel shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
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
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <AdmitPill status={detail.admitStatus} />
                {detail.admitStatus === "pending" && detail.admitRequestId ? (
                  <Link
                    href={`/edit/${detail.admitRequestId}`}
                    className="text-accent hover:underline"
                  >
                    查看变更单 #{detail.admitRequestId}
                  </Link>
                ) : null}
                {detail.admitStatus === "admitted" && detail.admittedPeopleId ? (
                  <Link
                    href={`/people/${detail.admittedPeopleId}/lineage`}
                    className="text-accent hover:underline"
                  >
                    正式成员 #{detail.admittedPeopleId}
                  </Link>
                ) : null}
              </div>
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

            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">
              <Button variant="secondary" onClick={closeDetail}>
                关闭
              </Button>
              {canEdit &&
              (!detail.admitStatus || detail.admitStatus === "none") &&
              !editing ? (
                <Link href={`/edit/new?daikao=${detail.id}`}>
                  <Button variant="ok">申请入谱</Button>
                </Link>
              ) : null}
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

      <DaikaoBatchAdmitDialog
        open={batchOpen}
        ids={selectedIds}
        onClose={() => setBatchOpen(false)}
        onDone={() => {
          setSelected({});
          load();
        }}
      />
    </div>
  );
}
