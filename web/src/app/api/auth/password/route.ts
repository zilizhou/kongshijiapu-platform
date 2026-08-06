import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  changeOwnPassword,
  PasswordError,
  requireSession,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword ?? body.oldPassword ?? "");
    const newPassword = String(body.newPassword ?? body.password ?? "");
    const confirmPassword =
      body.confirmPassword != null ? String(body.confirmPassword) : null;

    if (confirmPassword != null && confirmPassword !== newPassword) {
      return NextResponse.json({ error: "两次输入的新密码不一致" }, { status: 400 });
    }

    await changeOwnPassword(user.id, currentPassword, newPassword);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof PasswordError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "修改密码失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
