import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { searchDaikaoGroups } from "@/lib/daikao";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams.get("q") || undefined;
    const items = await searchDaikaoGroups(q, 20);
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
