import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertCanEditParentLink,
  createParentAndLink,
} from "@/lib/parent-link-queue";
import { PeoplePayload } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    assertCanEditParentLink(user);
    const body = await req.json();
    const peopleId = Number(body.peopleId);
    if (!Number.isFinite(peopleId) || peopleId <= 0) {
      return NextResponse.json({ error: "无效的成员 ID" }, { status: 400 });
    }
    const parentPayload = body.parent as Partial<PeoplePayload> | undefined;
    const result = await createParentAndLink({
      peopleId,
      operatorName: user.displayName || user.username,
      parentPayload,
    });
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "新建父亲并挂接失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
