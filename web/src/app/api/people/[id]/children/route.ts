import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getChildren } from "@/lib/people";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const items = await getChildren(Number(id));
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
