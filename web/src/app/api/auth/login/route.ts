import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, loginWithPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }
  try {
    const user = await loginWithPassword(username, password);
    if (!user) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }
    const token = await createSessionToken(user);
    const res = NextResponse.json({ user });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登录失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
