import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireSession } from "@/lib/auth";
import { updatePeopleFeeStatus } from "@/lib/people";
import { parsePeopleFeeStatus } from "@/lib/people-fee";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    requireRole(user, ["editor"]);
    const { id } = await ctx.params;
    const peopleId = Number(id);
    if (!Number.isFinite(peopleId) || peopleId <= 0) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    const body = await req.json();
    const feeStatus = parsePeopleFeeStatus(body?.feeStatus);
    if (!feeStatus) {
      return NextResponse.json(
        { error: "缴费状态须为已交费或未交费" },
        { status: 400 },
      );
    }
    const person = await updatePeopleFeeStatus(peopleId, feeStatus);
    return NextResponse.json({ person });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新失败";
    const status = e instanceof AuthError ? e.status : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
