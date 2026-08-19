import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { daikaoRowToPeopleRow, getDaikaoChildren } from "@/lib/daikao";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const rows = await getDaikaoChildren(Number(id));
    return NextResponse.json({ items: rows.map(daikaoRowToPeopleRow) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
