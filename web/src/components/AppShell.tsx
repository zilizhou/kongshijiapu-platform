"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { ROLE_LABEL, SessionUser } from "@/lib/types";
import { Button } from "./ui";

type NavItem = { href: string; label: string; match?: string };

const navFor = (role: string): NavItem[] => {
  const items: NavItem[] = [
    { href: "/dashboard", label: "首页" },
    { href: "/people", label: "家谱管理", match: "/people" },
    { href: "/daikao", label: "待考管理", match: "/daikao" },
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <div className="text-right leading-tight">
                  <div className="font-medium text-ink">{user.displayName}</div>
                  <div className="text-xs text-muted">
                    {user.username} · {ROLE_LABEL[user.role]}
                  </div>
                </div>
                <Button variant="secondary" onClick={logout}>
                  退出
                </Button>
              </>
            ) : null}
          </div>
        </header>
        <main className="flex-1 px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
