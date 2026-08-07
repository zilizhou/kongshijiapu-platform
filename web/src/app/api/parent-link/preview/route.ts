import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { previewParentLink } from "@/lib/parent-link-queue";

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = await req.json();
    const ids = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => Number(x)).filter((n: number) => n > 0)
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "请选择队列项" }, { status: 400 });
    }
    const items = await previewParentLink(ids);
    return NextResponse.json({ items });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "预览失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
