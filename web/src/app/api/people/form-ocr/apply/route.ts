import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { applyFormOcrItems } from "@/lib/form-ocr";
import type { PeoplePayload } from "@/lib/types";

type ApplyItem = {
  operation: "create" | "update";
  peopleId?: number | null;
  payload: PeoplePayload;
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!["editor", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "仅录入员可填入变更单" }, { status: 403 });
    }
    const body = await req.json();
    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items: ApplyItem[] = itemsRaw
      .map((x: ApplyItem) => ({
        operation: x.operation === "update" ? "update" : "create",
        peopleId: x.peopleId != null ? Number(x.peopleId) : null,
        payload: x.payload,
      }))
      .filter((x: ApplyItem) => x.payload && x.payload.name);

    if (!items.length) {
      return NextResponse.json({ error: "请至少选择一位成员" }, { status: 400 });
    }
    if (items.length > 40) {
      return NextResponse.json({ error: "单次最多填入 40 人" }, { status: 400 });
    }

    const results = await applyFormOcrItems({
      user,
      items,
      submit: !!body.submit,
    });
    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      okCount,
      failCount: results.length - okCount,
      results,
    });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "填入失败";
    return NextResponse.json({ error: msg }, { status: status || 500 });
  }
}
