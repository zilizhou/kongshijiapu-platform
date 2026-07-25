import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createRequest, listRequests } from "@/lib/workflow";
import { ChangePayload, ObjectType, Operation } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession();
    const sp = req.nextUrl.searchParams;
    const mode = (sp.get("mode") || "mine") as "mine" | "review" | "all";
    const data = await listRequests({
      user,
      mode,
      status: sp.get("status") || undefined,
      operation: sp.get("operation") || undefined,
      q: sp.get("q") || undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 20,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const body = await req.json();
    const operation = body.operation as Operation;
    const objectType = (body.objectType || "people") as ObjectType;
    const payload = body.payload as ChangePayload;
    if (!operation || !payload) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    if (operation === "reorder") {
      const p = payload as { childIds?: number[]; name?: string };
      if (!body.objectId || !p.childIds?.length) {
        return NextResponse.json({ error: "排行参数不完整" }, { status: 400 });
      }
      p.name = p.name || "排行調整";
    } else if (!(payload as { name?: string }).name) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    const item = await createRequest({
      user,
      objectType,
      operation,
      objectId: body.objectId ?? null,
      payload,
      submit: Boolean(body.submit),
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "创建失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
