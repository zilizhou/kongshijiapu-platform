import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  deleteOwnRequest,
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

/**
 * 保存/提交/删除统一走 POST。
 * 部分局域网网关会拦截 PATCH/DELETE，浏览器只显示 Failed to fetch。
 *
 * body:
 * - { payload, submit?, asReviewer? } 保存或提交
 * - { action: "delete" } 删除编修单
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    if (body?.action === "delete") {
      const result = await deleteOwnRequest(Number(id), user);
      return NextResponse.json(result);
    }

    const payload = body.payload as ChangePayload;
    if (!payload) {
      return NextResponse.json({ error: "缺少表单数据" }, { status: 400 });
    }
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

/** 兼容旧客户端；新代码请用 POST */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return POST(req, ctx);
}

/** 兼容旧客户端；新代码请用 POST { action: "delete" } */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const result = await deleteOwnRequest(Number(id), user);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "删除失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
