"use client";

import Link from "next/link";
import {
  Fragment,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PeopleRow, SessionUser } from "@/lib/types";
import { BranchPicker } from "@/components/BranchPicker";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  StatusPill,
  TableScroll,
  tableHeadClass,
} from "@/components/ui";

function formatGroup(g: string | null | undefined) {
  if (!g) return "-";
  const parts = g
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "-";
  return parts.reverse().join("/");
}

function dash(v: string | null | undefined) {
  return v && String(v).trim() ? String(v) : "-";
}

function ActionBtn({
  children,
  className = "",
  onClick,
  href,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
}) {
  const cls = `inline-flex items-center justify-center rounded px-2 py-0.5 text-xs text-white whitespace-nowrap ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

type PeopleFilters = {
  name: string;
  no: string;
  level: string;
  group: string;
  sex: string;
  address: string;
};

const emptyFilters: PeopleFilters = {
  name: "",
  no: "",
  level: "",
  group: "",
  sex: "",
  address: "",
};

export default function PeoplePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  // 输入框草稿：点「查询」后才生效，避免边输边请求、慢请求回写错乱
  const [name, setName] = useState("");
  const [no, setNo] = useState("");
  const [level, setLevel] = useState("");
  const [group, setGroup] = useState("");
  const [sex, setSex] = useState("");
  const [address, setAddress] = useState("");
  const [filters, setFilters] = useState<PeopleFilters>(emptyFilters);
  const [auditStatus, setAuditStatus] = useState("");
  const [moreFilters, setMoreFilters] = useState(false);
  const [operable, setOperable] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<PeopleRow[]>([]);
  const [expanded, setExpanded] = useState<Record<number, PeopleRow[]>>({});
  const [expandingId, setExpandingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<PeopleRow | null>(null);
  const [gotoPage, setGotoPage] = useState("");
  const loadSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null));
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError("");
    const sp = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (filters.name) sp.set("name", filters.name);
    if (filters.no) sp.set("no", filters.no);
    if (filters.level) sp.set("level", filters.level);
    if (filters.group) sp.set("group", filters.group);
    if (filters.sex) sp.set("sex", filters.sex);
    if (filters.address) sp.set("address", filters.address);
    if (auditStatus) sp.set("auditStatus", auditStatus);
    try {
      const res = await fetch(`/api/people?${sp}`, { signal: ac.signal });
      const data = await res.json();
      if (seq !== loadSeq.current) return;
      if (!res.ok) throw new Error(data.error || "查询失败");
      setItems(data.items);
      setTotal(data.total);
      setExpanded({});
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [page, pageSize, filters, auditStatus]);

  useEffect(() => {
    load();
  }, [load]);

  function applySearch(next: PeopleFilters = {
    name,
    no,
    level,
    group,
    sex,
    address,
  }) {
    setFilters(next);
    setPage(1);
  }

  function reset() {
    setName("");
    setNo("");
    setLevel("");
    setGroup("");
    setSex("");
    setAddress("");
    setAuditStatus("");
    applySearch(emptyFilters);
  }

  async function toggleChildren(id: number) {
    if (expanded[id]) {
      const next = { ...expanded };
      delete next[id];
      setExpanded(next);
      return;
    }
    if (expandingId === id) return;
    setExpandingId(id);
    try {
      const res = await fetch(`/api/people/${id}/children`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载子代失败");
      setExpanded((prev) => ({ ...prev, [id]: data.items || [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载子代失败");
    } finally {
      setExpandingId(null);
    }
  }

  async function submitDelete(person: PeopleRow) {
    if (!confirm(`确认提交删除「${person.name}」？将进入审核流程。`)) return;
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "delete",
        objectId: person.id,
        submit: true,
        payload: {
          name: person.name,
          sex: person.sex === "女" ? "女" : "男",
          no: person.no,
          level: person.level,
          group: person.groupName,
          parentId: person.parentId,
          description: person.description,
          spouse: person.spouse,
          spouseInfo: person.spouseInfo,
          birthday: person.birthday,
          deathday: person.deathday,
          address: person.address,
          pinyin: person.pinyin,
          volume: person.volume,
          isHeir: person.isHeir === "1" ? "1" : "0",
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "提交失败");
      return;
    }
    alert("已提交删除审核");
  }

  const canEdit = user?.role === "editor" || user?.role === "admin";
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const pageNumbers = useMemo(() => {
    const list: (number | "...")[] = [];
    if (pages <= 7) {
      for (let i = 1; i <= pages; i++) list.push(i);
      return list;
    }
    list.push(1);
    if (page > 3) list.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) {
      list.push(i);
    }
    if (page < pages - 2) list.push("...");
    list.push(pages);
    return list;
  }, [page, pages]);

  async function openDrawer(p: PeopleRow) {
    setDrawer(p);
    try {
      const res = await fetch(`/api/people/${p.id}`);
      const data = await res.json();
      if (res.ok && data.person) setDrawer(data.person as PeopleRow);
    } catch {
      /* 列表行数据已够用，详情补全失败时保留当前 */
    }
  }

  function renderActions(p: PeopleRow, compact = false) {
    if (!operable && !compact) {
      return (
        <ActionBtn className="bg-[#5c6570]" onClick={() => openDrawer(p)}>
          详情
        </ActionBtn>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        <ActionBtn className="bg-[#5c6570]" onClick={() => openDrawer(p)}>
          详情
        </ActionBtn>
        {operable && canEdit ? (
          <ActionBtn className="bg-accent" href={`/edit/new?from=${p.id}&op=update`}>
            编辑
          </ActionBtn>
        ) : null}
        {operable ? (
          <>
            <ActionBtn className="bg-[#2f6b4f]" href={`/people/${p.id}/lineage`}>
              世系图
            </ActionBtn>
            <ActionBtn className="bg-[#6b7280]" href={`/people/${p.id}/yizi`}>
              一字图
            </ActionBtn>
          </>
        ) : null}
        {operable && canEdit ? (
          <ActionBtn className="bg-[#c0392b]" onClick={() => submitDelete(p)}>
            删除
          </ActionBtn>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div>
            <Label>姓名</Label>
            <Input
              clearable
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
              placeholder="请输入姓名"
            />
          </div>
          <div>
            <Label>性别</Label>
            <Select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">请选择性别</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </Select>
          </div>
          <div>
            <Label>所属派户支</Label>
            <BranchPicker
              value={group}
              onChange={setGroup}
              placeholder="输入名称搜索派户支"
            />
          </div>
          <div>
            <Label>世代</Label>
            <Input
              clearable
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="请输入世代"
            />
          </div>
          <div>
            <Label>地址</Label>
            <Input
              clearable
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="请输入地址"
            />
          </div>
        </div>

        {moreFilters ? (
          <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <div>
              <Label>谱号</Label>
              <Input
                clearable
                value={no}
                onChange={(e) => setNo(e.target.value)}
                placeholder="请输入谱号"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="text-sm text-accent hover:underline"
            onClick={() => setMoreFilters((v) => !v)}
          >
            {moreFilters ? "收起" : "展开"}
          </button>
          <Button onClick={() => applySearch()}>查询</Button>
          <Button variant="secondary" onClick={reset}>
            重置
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-medium text-muted">审核状态</span>
            <Select
              className="w-36"
              value={auditStatus}
              onChange={(e) => {
                setAuditStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">全部</option>
              <option value="draft">暂存</option>
              <option value="pending_1">待一审</option>
              <option value="pending_2">待二审</option>
              <option value="pending_final">待终审</option>
              <option value="approved">终审通过</option>
              <option value="rejected">已驳回</option>
            </Select>
          </div>
        </div>
      </Card>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="font-display text-lg">成员列表</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md border border-line text-xs">
              <button
                type="button"
                className={`px-3 py-1.5 ${
                  operable ? "bg-accent text-white" : "bg-white text-muted"
                }`}
                onClick={() => setOperable(true)}
              >
                可操作
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 ${
                  !operable ? "bg-accent text-white" : "bg-white text-muted"
                }`}
                onClick={() => setOperable(false)}
              >
                仅查看
              </button>
            </div>
            {canEdit ? (
              <Link href="/edit/new">
                <Button>新增家谱成员</Button>
              </Link>
            ) : null}
          </div>
        </div>

        <TableScroll>
          <table className="min-w-[1100px] w-full text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-3 py-3 font-medium">序号</th>
                <th className="px-3 py-3 font-medium">姓名</th>
                <th className="px-3 py-3 font-medium">性别</th>
                <th className="px-3 py-3 font-medium">代数</th>
                <th className="px-3 py-3 font-medium">所属派户支</th>
                <th className="px-3 py-3 font-medium">地址</th>
                <th className="px-3 py-3 font-medium">是否出嗣</th>
                <th className="px-3 py-3 font-medium">更新时间</th>
                <th className="px-3 py-3 font-medium">审核状态</th>
                <th className="px-3 py-3 font-medium">显示子代</th>
                <th className="px-3 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-10 text-center text-muted" colSpan={11}>
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-muted" colSpan={11}>
                    无结果
                  </td>
                </tr>
              ) : (
                items.map((p, idx) => {
                  const isOpen = Boolean(expanded[p.id]);
                  const isLoadingKids = expandingId === p.id;
                  return (
                  <Fragment key={p.id}>
                    <tr
                      className={`border-t border-t-line/70 ${
                        isOpen
                          ? "border-l-[3px] border-l-[#c47a2c] bg-[#fff3e0]"
                          : "border-l-[3px] border-l-transparent hover:bg-soft/40"
                      }`}
                    >
                      <td className="px-3 py-3 text-muted">
                        {(page - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-3 py-3 font-medium">{p.name}</td>
                      <td className="px-3 py-3">{p.sex}</td>
                      <td className="px-3 py-3">{p.level ?? "-"}</td>
                      <td
                        className="max-w-[220px] truncate px-3 py-3"
                        title={formatGroup(p.groupName)}
                      >
                        {formatGroup(p.groupName)}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-3">
                        {dash(p.address)}
                      </td>
                      <td className="px-3 py-3">
                        {p.isHeir === "1" ? "是" : "否"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">
                        {dash(p.editTime)}
                      </td>
                      <td className="px-3 py-3">
                        {p.reviewStatus ? (
                          <StatusPill status={p.reviewStatus} />
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {(p.childCount || 0) > 0 ? (
                          <button
                            type="button"
                            disabled={isLoadingKids}
                            className="rounded bg-[#c47a2c] px-2.5 py-1 text-xs text-white hover:bg-[#a86520] disabled:opacity-60"
                            onClick={() => toggleChildren(p.id)}
                          >
                            {isLoadingKids
                              ? "加载中"
                              : isOpen
                                ? "收起"
                                : "展开"}
                          </button>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3">{renderActions(p)}</td>
                    </tr>
                    {expanded[p.id]?.map((c, cidx) => (
                      <tr
                        key={`${p.id}-${c.id}`}
                        className="border-t border-t-[#d9c2a3] border-l-[3px] border-l-[#8b6914] bg-[#efe0cc]"
                      >
                        <td className="px-3 py-2 pl-5 text-xs text-[#6b5344]">
                          └ {cidx + 1}
                        </td>
                        <td className="px-3 py-2 pl-8 font-medium text-[#4a3728]">
                          {c.name}
                        </td>
                        <td className="px-3 py-2">{c.sex}</td>
                        <td className="px-3 py-2">{c.level ?? "-"}</td>
                        <td className="px-3 py-2">{formatGroup(c.groupName)}</td>
                        <td className="px-3 py-2">{dash(c.address)}</td>
                        <td className="px-3 py-2">
                          {c.isHeir === "1" ? "是" : "否"}
                        </td>
                        <td className="px-3 py-2">{dash(c.editTime)}</td>
                        <td className="px-3 py-2">
                          {c.reviewStatus ? (
                            <StatusPill status={c.reviewStatus} />
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2">-</td>
                        <td className="px-3 py-2">{renderActions(c)}</td>
                      </tr>
                    ))}
                  </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScroll>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
          <span>共 {total.toLocaleString()} 条</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-28"
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="10">10条/页</option>
              <option value="20">20条/页</option>
              <option value="50">50条/页</option>
            </Select>
            <button
              type="button"
              disabled={page <= 1}
              className="rounded border border-line px-2 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {pageNumbers.map((n, i) =>
              n === "..." ? (
                <span key={`e-${i}`} className="px-1">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className={`min-w-8 rounded px-2 py-1 ${
                    n === page
                      ? "bg-accent text-white"
                      : "border border-line hover:bg-soft"
                  }`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={page >= pages}
              className="rounded border border-line px-2 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              ›
            </button>
            <span className="ml-1">前往</span>
            <input
              className="w-14 rounded border border-line px-2 py-1 text-center outline-none focus:border-accent"
              value={gotoPage}
              onChange={(e) => setGotoPage(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number(gotoPage);
                  if (n >= 1 && n <= pages) setPage(n);
                }
              }}
            />
            <span>页</span>
          </div>
        </div>
      </Card>

      {drawer ? (
        <div
          className="fixed inset-0 z-30 flex justify-end bg-ink/30"
          onClick={() => setDrawer(null)}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="font-display text-2xl">{drawer.name}</div>
                <div className="text-sm text-muted">
                  {drawer.sex} · 第 {drawer.level ?? "?"} 世 ·{" "}
                  {drawer.isHeir === "1" ? "出嗣" : "未出嗣"}
                </div>
              </div>
              <Button variant="ghost" onClick={() => setDrawer(null)}>
                关闭
              </Button>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                ["所属派户支", formatGroup(drawer.groupName)],
                ["谱号", drawer.no],
                ["父名", drawer.parentName],
                ["地址", drawer.address],
                ["生年", drawer.birthday],
                ["卒年", drawer.deathday],
                ["配偶", drawer.spouse],
                ["配偶信息", drawer.spouseInfo],
                ["更新时间", drawer.editTime],
                ["卷次", drawer.volume],
                ["小传", drawer.description],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-ink">
                    {dash(v as string)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <ActionBtn className="bg-[#2f6b4f] !px-3 !py-1.5" href={`/people/${drawer.id}/lineage`}>
                世系图
              </ActionBtn>
              <ActionBtn className="bg-[#6b7280] !px-3 !py-1.5" href={`/people/${drawer.id}/yizi`}>
                一字图
              </ActionBtn>
              {canEdit ? (
                <ActionBtn
                  className="bg-accent !px-3 !py-1.5"
                  href={`/edit/new?from=${drawer.id}&op=update`}
                >
                  编辑
                </ActionBtn>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
