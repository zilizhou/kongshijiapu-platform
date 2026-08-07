import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertCanEditParentLink,
  linkQueueToParent,
} from "@/lib/parent-link-queue";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    assertCanEditParentLink(user);
    const body = await req.json();
    const peopleId = Number(body.peopleId);
    const parentId = Number(body.parentId);
    if (!Number.isFinite(peopleId) || peopleId <= 0) {
      return NextResponse.json({ error: "无效的成员 ID" }, { status: 400 });
    }
    if (!Number.isFinite(parentId) || parentId <= 0) {
      return NextResponse.json({ error: "无效的父亲 ID" }, { status: 400 });
    }
    const result = await linkQueueToParent({
      peopleId,
      parentId,
      operatorName: user.displayName || user.username,
      matchHint: body.matchHint || "manual",
    });
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "挂接失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
