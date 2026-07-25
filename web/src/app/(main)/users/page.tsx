"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  AppUserRow,
  ROLE_LABEL,
  Role,
  SessionUser,
} from "@/lib/types";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "editor", label: "录入员" },
  { value: "first", label: "一审" },
  { value: "second", label: "二审" },
  { value: "final", label: "终审" },
  { value: "admin", label: "管理员" },
];

const emptyForm = () => ({
  username: "",
  displayName: "",
  role: "first" as Role,
  password: "",
  isActive: true,
});

export default function UsersPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<AppUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editItem, setEditItem] = useState<AppUserRow | null>(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user || null))
      .catch(() => setMe(null))
      .finally(() => setReady(true));
  }, []);

  const isAdmin = me?.role === "admin";

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    const sp = new URLSearchParams({
      page: String(page),
      pageSize: "20",
    });
    if (role) sp.set("role", role);
    if (q) sp.set("q", q);
    try {
      const res = await fetch(`/api/users?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, role, q]);

  useEffect(() => {
    if (ready && isAdmin) load();
  }, [ready, isAdmin, load]);

  const pages = Math.max(1, Math.ceil(total / 20));

  function openCreate() {
    setCreating(true);
    setEditItem(null);
    setForm(emptyForm());
  }

  function openEdit(u: AppUserRow) {
    setCreating(false);
    setEditItem(u);
    setForm({
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      password: "",
      isActive: u.isActive,
    });
  }

  async function removeUser(u: AppUserRow) {
    if (me && u.id === me.id) {
      setError("不能删除当前登录账号");
      return;
    }
    if (
      !window.confirm(
        `确认删除账号「${u.username}」（${ROLE_LABEL[u.role] || u.role}）？此操作不可恢复。`,
      )
    ) {
      return;
    }
    setError("");
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function saveForm() {
    setSaving(true);
    setError("");
    try {
      if (editItem) {
        const res = await fetch(`/api/users/${editItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: form.displayName,
            role: form.role,
            isActive: form.isActive,
            password: form.password || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "保存失败");
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.username,
            displayName: form.displayName,
            role: form.role,
            password: form.password,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "创建失败");
      }
      setCreating(false);
      setEditItem(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return <div className="text-muted">加载中...</div>;
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="用户管理" desc="仅管理员可访问。" />
        <Card className="flex min-h-[240px] flex-col items-center justify-center p-10 text-center">
          <div className="font-display text-2xl text-ink">无权限</div>
          <p className="mt-3 text-sm text-muted">
            账号与角色管理仅对管理员开放。
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="用户管理"
        desc="管理录入员、一审、二审、终审与管理员账号：新建、改角色、启停用、重置密码。"
        actions={<Button onClick={openCreate}>新增账号</Button>}
      />

      <FilterBar
        actions={
          <>
            <Button
              onClick={() => {
                setPage(1);
                load();
              }}
            >
              查询
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setRole("");
                setQ("");
                setPage(1);
              }}
            >
              重置
            </Button>
          </>
        }
      >
        <FilterField className="w-32">
          <Select
            compact
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">角色</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField className="min-w-[12rem] flex-1">
          <Input
            compact
            clearable
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="用户名 / 显示名"
          />
        </FilterField>
      </FilterBar>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      <Card className="overflow-hidden">
        <TableScroll>
          <table className="min-w-full text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-4 py-3">用户名</th>
                <th className="px-4 py-3">显示名</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    加载中...
                  </td>
                </tr>
              ) : null}
              {!loading &&
                items.map((u) => (
                  <tr key={u.id} className="border-t border-line/70">
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3">{u.displayName}</td>
                    <td className="px-4 py-3">
                      {ROLE_LABEL[u.role] || u.role}
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive ? (
                        <span className="text-ok">启用</span>
                      ) : (
                        <span className="text-muted">停用</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{u.createdAt || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-accent hover:underline"
                          onClick={() => openEdit(u)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="text-danger hover:underline disabled:opacity-40"
                          disabled={Boolean(me && u.id === me.id)}
                          title={
                            me && u.id === me.id
                              ? "不能删除当前登录账号"
                              : "删除"
                          }
                          onClick={() => removeUser(u)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-muted">
                    暂无账号
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableScroll>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
          <span>
            共 {total} 条 · 第 {page}/{pages} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>

      {creating || editItem ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh]"
          onClick={() => {
            setCreating(false);
            setEditItem(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-line bg-panel shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line px-5 py-4 font-display text-lg">
              {editItem ? "编辑账号" : "新增账号"}
            </div>
            <div className="grid gap-3 px-5 py-4">
              <label className="text-sm">
                <span className="mb-1 block text-muted">用户名 *</span>
                <Input
                  value={form.username}
                  disabled={Boolean(editItem)}
                  placeholder="字母数字下划线"
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">显示名称 *</span>
                <Input
                  value={form.displayName}
                  onChange={(e) =>
                    setForm({ ...form, displayName: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">角色 *</span>
                <Select
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as Role })
                  }
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">
                  {editItem ? "新密码（留空则不改）" : "密码 *"}
                </span>
                <Input
                  type="password"
                  value={form.password}
                  placeholder={editItem ? "不修改请留空" : "至少 6 位"}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </label>
              {editItem ? (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.target.checked })
                    }
                  />
                  启用账号
                </label>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setCreating(false);
                  setEditItem(null);
                }}
              >
                取消
              </Button>
              <Button disabled={saving} onClick={saveForm}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
