"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登录失败");
      router.replace(sp.get("next") || "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <section className="relative hidden w-[58%] overflow-hidden bg-sidebar text-white md:flex md:flex-col md:justify-center md:px-16 lg:px-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(161,40,40,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.35), transparent 40%)",
          }}
        />
        <div className="relative z-10 max-w-lg">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-white/10 font-display text-3xl tracking-widest">
            谱
          </div>
          <h1 className="font-display text-5xl tracking-[0.12em]">孔子世家谱</h1>
          <p className="mt-4 text-lg text-white/80">管理系统</p>
          <p className="mt-6 max-w-md text-sm leading-7 text-white/65">
            传承千年文脉，记录世代荣光。致力于家族文化传承的数字化平台。
          </p>
          <div className="mt-8 h-px w-16 bg-white/30" />
        </div>
      </section>

      <section className="flex w-full flex-col justify-center bg-soft px-6 py-10 md:w-[42%] md:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <div className="font-display text-3xl text-ink">孔子世家谱</div>
            <p className="mt-1 text-sm text-muted">管理系统</p>
          </div>
          <h2 className="font-display text-3xl text-ink">欢迎登录</h2>
          <p className="mt-2 text-sm text-muted">请输入您的账号和密码</p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div>
              <Label>账号</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="账号"
                autoComplete="username"
              />
            </div>
            <div>
              <Label>密码</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                autoComplete="current-password"
              />
            </div>
            {error ? <p className="text-sm text-accent">{error}</p> : null}
            <Button className="mt-2 w-full py-2.5" disabled={loading}>
              {loading ? "登录中..." : "登 录"}
            </Button>
          </form>

          <p className="mt-10 text-center text-xs text-muted">
            © 2025 孔子世家谱管理系统
          </p>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted">加载中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
