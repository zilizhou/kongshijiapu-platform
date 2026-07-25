import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertCanEditDaikao,
  getDaikaoById,
  getDaikaoChildren,
  updateDaikao,
} from "@/lib/daikao";
import { DaikaoUpdatePayload } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const person = await getDaikaoById(Number(id));
    if (!person) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    const children = await getDaikaoChildren(person.id);
    return NextResponse.json({ person, children });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    assertCanEditDaikao(user);
    const { id } = await ctx.params;
    const body = (await req.json()) as DaikaoUpdatePayload;
    const person = await updateDaikao(Number(id), body);
    if (!person) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    return NextResponse.json({ person });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 400;
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
