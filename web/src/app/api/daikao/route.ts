import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { searchDaikao } from "@/lib/daikao";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const data = await searchDaikao({
      name: sp.get("name") || undefined,
      no: sp.get("no") || undefined,
      level: sp.get("level") || undefined,
      group: sp.get("group") || undefined,
      sourceFile: sp.get("sourceFile") || undefined,
      volume: sp.get("volume") || undefined,
      section: sp.get("section") || undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 10,
    });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
