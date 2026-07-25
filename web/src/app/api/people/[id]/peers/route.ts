import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPeersChart } from "@/lib/people";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const data = await getPeersChart(Number(id));
    if (!data) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
