import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { approveRequest } from "@/lib/workflow";
import { ChangePayload } from "@/lib/types";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const payload =
      body && typeof body === "object" && body.payload
        ? (body.payload as ChangePayload)
        : undefined;
    const item = await approveRequest(Number(id), user, { payload });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "审核失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
