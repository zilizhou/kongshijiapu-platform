import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  daikaoRowToPeopleRow,
  getDaikaoById,
  getDaikaoChildren,
} from "@/lib/daikao";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const daikao = await getDaikaoById(Number(id));
    if (!daikao) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    const children = await getDaikaoChildren(daikao.id);
    return NextResponse.json({
      person: daikaoRowToPeopleRow(daikao),
      daikao,
      children,
    });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: "请通过「我的编修」提交变更单，不再直接保存待考库" },
    { status: 400 },
  );
}
