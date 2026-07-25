import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { Role } from "@/lib/types";
import { deleteUser, getUserById, updateUser } from "@/lib/users";

function assertAdmin(role: string) {
  if (role !== "admin") {
    const err = new AuthError("仅管理员可管理用户");
    err.status = 403;
    throw err;
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    assertAdmin(user.role);
    const { id } = await ctx.params;
    const item = await getUserById(id);
    if (!item) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    assertAdmin(user.role);
    const { id } = await ctx.params;
    const body = await req.json();
    const item = await updateUser(
      id,
      {
        displayName:
          body.displayName != null ? String(body.displayName) : undefined,
        role: body.role as Role | undefined,
        isActive:
          body.isActive != null ? Boolean(body.isActive) : undefined,
        password:
          body.password != null && body.password !== ""
            ? String(body.password)
            : undefined,
      },
      user.id,
    );
    return NextResponse.json({ item });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 400;
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    assertAdmin(user.role);
    const { id } = await ctx.params;
    await deleteUser(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 400;
    const msg = e instanceof Error ? e.message : "删除失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
