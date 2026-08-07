import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertCanEditParentLink,
  skipParentLink,
} from "@/lib/parent-link-queue";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    assertCanEditParentLink(user);
    const body = await req.json();
    const peopleId = Number(body.peopleId);
    if (!Number.isFinite(peopleId) || peopleId <= 0) {
      return NextResponse.json({ error: "无效的成员 ID" }, { status: 400 });
    }
    await skipParentLink({
      peopleId,
      operatorName: user.displayName || user.username,
      note: body.note || "",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "跳过失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
