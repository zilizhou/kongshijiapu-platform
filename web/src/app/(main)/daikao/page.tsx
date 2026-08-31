"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DaikaoBatchAdmitDialog } from "@/components/DaikaoBatchAdmitDialog";
import { DaikaoForm, DaikaoFormValue } from "@/components/DaikaoForm";
import { PeopleImportDialog } from "@/components/PeopleImportDialog";
import { StructuredTextFillDialog } from "@/components/StructuredTextFillDialog";
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

function canAdmitRow(p: DaikaoRow) {
  if (p.admitStatus !== "none") return false;
  if (
    p.reviewStatus &&
    ["pending_1", "pending_2", "pending_final"].includes(p.reviewStatus)
  ) {
    return false;
  }
  return true;
}

function daikaoEditHref(p: DaikaoRow) {
  if (
    p.reviewRequestId &&
    p.reviewStatus &&
    ["draft", "rejected", "pending_1", "pending_2", "pending_final"].includes(
      p.reviewStatus,
    )
  ) {
    return `/edit/${p.reviewRequestId}`;
  }
  return `/edit/new?from=${p.id}&op=update&scope=daikao`;
}

export default function DaikaoPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [no, setNo] = useState("");
  const [level, setLevel] = useState("");
  const [group, setGroup] = useState("");
  const [sourceFile, setSourceFile] = useState("");
  const [volume, setVolume] = useState("");
  const [idCard, setIdCard] = useState("");
  const [admitStatus, setAdmitStatus] = useState("none");
  const [applied, setApplied] = useState({
    name: "",
    no: "",
    level: "",
    group: "",
    sourceFile: "",
    volume: "",
    idCard: "",
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
  const [form, setForm] = useState<DaikaoFormValue | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [batchOpen, setBatchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [textImportOpen, setTextImportOpen] = useState(false);

  const canEdit = canEditRole(user?.role);
  const canMutate = user?.role === "editor" || user?.role === "admin";

  const selectableIds = useMemo(
    () => items.filter((p) => canAdmitRow(p)).map((p) => p.id),
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
    if (applied.idCard) sp.set("idCard", applied.idCard);
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
    setApplied({ name, no, level, group, sourceFile, volume, idCard, admitStatus });
  }

  function reset() {
    setName("");
    setNo("");
    setLevel("");
    setGroup("");
    setSourceFile("");
    setVolume("");
    setIdCard("");
    setAdmitStatus("none");
    setPage(1);
    setApplied({
      name: "",
      no: "",
      level: "",
      group: "",
      sourceFile: "",
      volume: "",
      idCard: "",
      admitStatus: "none",
    });
  }

  async function openDetail(row: DaikaoRow) {
    setDetailLoading(true);
    setError("");
    setForm(null);
    try {
      const res = await fetch(`/api/daikao/${row.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      const person = (data.daikao || data.person) as DaikaoRow;
      setDetail(person);
      setChildren(data.children || []);
      setForm(rowToForm(person));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setChildren([]);
    setForm(null);
  }

  async function submitDelete(person: DaikaoRow) {
    if (!confirm(`确认提交删除待考「${person.name}」？将进入审核流程。`)) return;
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "delete",
          objectType: "daikao",
          objectId: person.id,
          submit: true,
          payload: {
            name: person.name,
            sex: person.sex === "女" ? "女" : "男",
            no: person.spectrumNo,
            level: person.generation,
            group: person.groupRaw,
            parentId: person.parentId,
            description: person.description,
            spouse: person.spouse,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交删除失败");
      alert("已提交删除审核");
      closeDetail();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交删除失败");
    }
  }

  return (
    <div>
      <PageHeader
        title="待考支管理"
        desc={
          canMutate
            ? "待考支与正式家谱平行编修：新增/导入/世系图走待考三审，写入待考库；确认无误后可「申请入谱」，再走正式库三审。"
            : "浏览待考支人员与世系；当前账号仅可查看。"
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
        <FilterField className="w-44">
          <Input
            compact
            clearable
            value={idCard}
            onChange={(e) => setIdCard(e.target.value)}
            placeholder="身份证号码"
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
            {canMutate ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setImportOpen(true)}
                >
                  批量导入
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setTextImportOpen(true)}
                >
                  粘贴文本导入
                </Button>
                <Link href="/edit/new?scope=daikao">
                  <Button>新增待考成员</Button>
                </Link>
                <Button
                  disabled={!selectedIds.length}
                  onClick={() => setBatchOpen(true)}
                >
                  批量申请入谱
                </Button>
              </>
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
                      {canAdmitRow(p) ? (
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
                        onClick={() => openDetail(p)}
                      >
                        详情
                      </button>
                      {canMutate ? (
                        <Link
                          href={daikaoEditHref(p)}
                          className="rounded bg-accent px-2 py-0.5 text-xs text-white"
                        >
                          {p.reviewStatus === "rejected" ? "改后重提" : "编辑"}
                        </Link>
                      ) : null}
                      <Link
                        href={`/daikao/${p.id}/lineage`}
                        className="rounded bg-sky-700 px-2 py-0.5 text-xs text-white"
                      >
                        世系图
                      </Link>
                      <Link
                        href={`/daikao/${p.id}/yizi`}
                        className="rounded bg-sky-800 px-2 py-0.5 text-xs text-white"
                      >
                        一字图
                      </Link>
                      {canMutate ? (
                        <button
                          type="button"
                          className="rounded bg-rose-700 px-2 py-0.5 text-xs text-white"
                          onClick={() => submitDelete(p)}
                        >
                          删除
                        </button>
                      ) : null}
                      {canMutate && canAdmitRow(p) ? (
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
                          入谱单
                        </Link>
                      ) : null}
                      {p.reviewRequestId &&
                      p.reviewStatus &&
                      ["draft", "pending_1", "pending_2", "pending_final", "rejected"].includes(
                        p.reviewStatus,
                      ) ? (
                        <Link
                          href={`/edit/${p.reviewRequestId}`}
                          className="rounded bg-amber-800 px-2 py-0.5 text-xs text-white"
                        >
                          待考单
                        </Link>
                      ) : null}
                      {p.admitStatus === "admitted" && p.admittedPeopleId ? (
                        <Link
                          href={`/people/${p.admittedPeopleId}/lineage`}
                          className="rounded bg-emerald-800 px-2 py-0.5 text-xs text-white"
                        >
                          正式世系
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
              <DaikaoForm
                value={form}
                onChange={setForm}
                disabled
                compareWith={null}
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
                        onClick={() => openDetail(c)}
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
              <Link href={`/daikao/${detail.id}/lineage`}>
                <Button variant="secondary">世系图</Button>
              </Link>
              <Link href={`/daikao/${detail.id}/yizi`}>
                <Button variant="secondary">一字图</Button>
              </Link>
              {canMutate && canAdmitRow(detail) ? (
                <Link href={`/edit/new?daikao=${detail.id}`}>
                  <Button variant="ok">申请入谱</Button>
                </Link>
              ) : null}
              {canMutate ? (
                <>
                  <Link href={daikaoEditHref(detail)}>
                    <Button>编辑</Button>
                  </Link>
                  <Button variant="danger" onClick={() => submitDelete(detail)}>
                    删除
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
      <PeopleImportDialog
        open={importOpen}
        scope="daikao"
        onClose={() => setImportOpen(false)}
        onDone={() => load()}
      />
      <StructuredTextFillDialog
        open={textImportOpen}
        scope="daikao"
        onClose={() => setTextImportOpen(false)}
        onDone={() => load()}
      />
    </div>
  );
}
