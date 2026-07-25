import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { searchPeople } from "@/lib/people";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const data = await searchPeople({
      q: sp.get("q") || undefined,
      name: sp.get("name") || undefined,
      no: sp.get("no") || undefined,
      level: sp.get("level") ? Number(sp.get("level")) : undefined,
      group: sp.get("group") || undefined,
      sex: sp.get("sex") || undefined,
      address: sp.get("address") || undefined,
      parentId: sp.get("parentId") ? Number(sp.get("parentId")) : undefined,
      auditStatus: sp.get("auditStatus") || undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 10,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
