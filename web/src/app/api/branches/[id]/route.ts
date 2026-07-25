import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getBranchById } from "@/lib/branch";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const item = await getBranchById(Number(id));
    if (!item) {
      return NextResponse.json({ error: "派户支不存在" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH() {
  await requireSession();
  return NextResponse.json(
    { error: "派户支变更须提交审核单，请在页面提交后走一审→二审→终审" },
    { status: 403 },
  );
}

export async function DELETE() {
  await requireSession();
  return NextResponse.json(
    { error: "派户支删除须提交审核单，请在页面提交后走一审→二审→终审" },
    { status: 403 },
  );
}
