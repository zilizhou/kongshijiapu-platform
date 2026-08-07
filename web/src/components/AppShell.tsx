"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { ROLE_LABEL, SessionUser } from "@/lib/types";
import { Button, Input, Label } from "./ui";

type NavItem = { href: string; label: string; match?: string };

const navFor = (role: string): NavItem[] => {
  const items: NavItem[] = [
    { href: "/dashboard", label: "首页" },
    { href: "/people", label: "家谱管理", match: "/people" },
    { href: "/daikao", label: "待考管理", match: "/daikao" },
    { href: "/parent-link", label: "挂接管理", match: "/parent-link" },
    { href: "/branches", label: "派户支管理", match: "/branches" },
  ];
  if (role === "editor" || role === "admin") {
    items.push({ href: "/edit", label: "我的编修", match: "/edit" });
  }
  if (["first", "second", "final", "admin"].includes(role)) {
    items.push({ href: "/review", label: "信息审核", match: "/review" });
  }
  if (role === "admin") {
    items.push({ href: "/users", label: "用户管理", match: "/users" });
  }
  items.push({ href: "/publish", label: "出版", match: "/publish" });
  items.push({ href: "/records", label: "工作记录", match: "/records" });
  return items;
};

function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setOkMsg("");
    setSaving(false);
  }, [open]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "修改失败");
      setOkMsg("密码已更新，请妥善保管");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      window.setTimeout(() => onClose(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <form
        className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-card"
        onSubmit={onSubmit}
      >
        <h2
          id="change-password-title"
          className="font-display text-lg text-ink"
        >
          修改密码
        </h2>
        <p className="mt-1 text-xs text-muted">
          新密码至少 8 位，且不能与当前密码相同。
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <Label>当前密码</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="当前登录密码"
              required
            />
          </div>
          <div>
            <Label>新密码</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 8 位"
              required
              minLength={8}
            />
          </div>
          <div>
            <Label>确认新密码</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再输入一次"
              required
              minLength={8}
            />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
        {okMsg ? <p className="mt-3 text-sm text-ok">{okMsg}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const nav = navFor(user?.role || "editor");
  const crumb =
    nav.find(
      (n) =>
        pathname === n.href ||
        (n.match && n.match !== "/dashboard" && pathname.startsWith(n.match)),
    )?.label || "首页";

  return (
    <div className="flex min-h-screen bg-soft">
      <aside
        className={`app-shell-aside sticky top-0 flex h-screen flex-col bg-sidebar text-white transition-all ${
          collapsed ? "w-[72px]" : "w-[220px]"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/90 font-display text-lg">
            谱
          </div>
          {!collapsed ? (
            <div className="font-display text-lg tracking-wide">孔子世家谱</div>
          ) : null}
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.match &&
                item.match !== "/dashboard" &&
                pathname.startsWith(item.match));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-accent text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
                title={item.label}
              >
                <span className={collapsed ? "mx-auto" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3 text-xs text-white/50">
          {!collapsed
            ? user?.role === "editor"
              ? "编修 · 查询"
              : "编修 · 审核 · 查询"
            : "谱"}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-shell-header sticky top-0 z-20 flex items-center justify-between border-b border-line bg-panel/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md border border-line px-2 py-1 text-sm text-muted hover:bg-soft"
              onClick={() => setCollapsed((v) => !v)}
              type="button"
            >
              {collapsed ? "展开" : "收起"}
            </button>
            <div className="text-sm text-muted">
              <span className="text-ink">{crumb}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            {user ? (
              <>
                <div className="hidden text-right leading-tight sm:block">
                  <div className="font-medium text-ink">{user.displayName}</div>
                  <div className="text-xs text-muted">
                    {user.username} · {ROLE_LABEL[user.role]}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPwdOpen(true)}
                >
                  修改密码
                </Button>
                <Button type="button" variant="secondary" onClick={logout}>
                  退出
                </Button>
              </>
            ) : null}
          </div>
        </header>
        <main className="flex-1 px-5 py-5">{children}</main>
      </div>

      <ChangePasswordDialog open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </div>
  );
}
