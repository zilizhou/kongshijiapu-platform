import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPeopleById } from "@/lib/people";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const person = await getPeopleById(Number(id));
    if (!person) return NextResponse.json({ error: "未找到" }, { status: 404 });
    return NextResponse.json({ person });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
