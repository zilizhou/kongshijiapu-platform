import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getLineageTree } from "@/lib/people";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const up = sp.get("up") ? Number(sp.get("up")) : 1;
    const down = sp.get("down") ? Number(sp.get("down")) : 1;
    const data = await getLineageTree(Number(id), { up, down });
    if (!data) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
