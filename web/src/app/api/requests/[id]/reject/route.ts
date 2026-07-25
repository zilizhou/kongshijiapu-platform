import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { rejectRequest } from "@/lib/workflow";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const item = await rejectRequest(Number(id), user, String(body.reason || ""));
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "驳回失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
