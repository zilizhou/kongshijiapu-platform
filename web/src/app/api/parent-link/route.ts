import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { searchParentLinkQueue } from "@/lib/parent-link-queue";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const data = await searchParentLinkQueue({
      name: sp.get("name") || undefined,
      parentName: sp.get("parentName") || undefined,
      group: sp.get("group") || undefined,
      level: sp.get("level") || undefined,
      status: sp.has("status") ? sp.get("status") ?? "" : undefined,
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
