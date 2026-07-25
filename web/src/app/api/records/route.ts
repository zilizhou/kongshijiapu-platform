import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listWorkRecords } from "@/lib/workflow";

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession();
    const sp = req.nextUrl.searchParams;
    const data = await listWorkRecords({
      user,
      operation: sp.get("operation") || undefined,
      action: sp.get("action") || undefined,
      q: sp.get("q") || undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 20,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
