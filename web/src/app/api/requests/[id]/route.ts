import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getRequestById,
  listEvents,
  reviewerSave,
  updateRequestDraft,
} from "@/lib/workflow";
import { ChangePayload } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const item = await getRequestById(Number(id));
    if (!item) return NextResponse.json({ error: "未找到" }, { status: 404 });
    const events = await listEvents(item.id);
    return NextResponse.json({ item, events });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const body = await req.json();
    const payload = body.payload as ChangePayload;
    const asReviewer = Boolean(body.asReviewer);
    const submit = Boolean(body.submit);
    const item = asReviewer
      ? await reviewerSave(Number(id), user, payload)
      : await updateRequestDraft(Number(id), user, payload, submit);
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
