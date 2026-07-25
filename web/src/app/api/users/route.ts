import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { Role } from "@/lib/types";
import { createUser, isManageableRole, listUsers } from "@/lib/users";

function assertAdmin(role: string) {
  if (role !== "admin") {
    const err = new AuthError("仅管理员可管理用户");
    err.status = 403;
    throw err;
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession();
    assertAdmin(user.role);
    const sp = req.nextUrl.searchParams;
    const role = sp.get("role") || "";
    const data = await listUsers({
      role: role && isManageableRole(role) ? (role as Role) : "",
      q: sp.get("q") || undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 20,
    });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    assertAdmin(user.role);
    const body = await req.json();
    const item = await createUser({
      username: String(body.username || ""),
      displayName: String(body.displayName || ""),
      role: body.role as Role,
      password: String(body.password || ""),
    });
    return NextResponse.json({ item });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 400;
    const msg = e instanceof Error ? e.message : "创建失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
