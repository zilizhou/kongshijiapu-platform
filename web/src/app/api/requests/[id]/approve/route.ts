import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { approveRequest } from "@/lib/workflow";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const item = await approveRequest(Number(id), user);
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "审核失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
