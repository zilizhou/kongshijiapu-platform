import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { approveRequest, getRequestById, rejectRequest } from "@/lib/workflow";

const MAX_BATCH = 50;

export type BatchReviewResult = {
  id: number;
  name: string;
  ok: boolean;
  error?: string;
};

/** POST { action: "approve"|"reject", ids: number[], reason?: string } */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const body = await req.json().catch(() => ({}));
    const action = body.action === "reject" ? "reject" : body.action === "approve" ? "approve" : "";
    if (!action) {
      return NextResponse.json(
        { error: "action 须为 approve 或 reject" },
        { status: 400 },
      );
    }

    const rawIds = Array.isArray(body.ids) ? (body.ids as unknown[]) : [];
    const ids = [
      ...new Set(
        rawIds
          .map((x) => Number(x))
          .filter((n): n is number => Number.isFinite(n) && n > 0),
      ),
    ];
    if (!ids.length) {
      return NextResponse.json({ error: "请选择待审单据" }, { status: 400 });
    }
    if (ids.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `单次最多 ${MAX_BATCH} 条，当前 ${ids.length} 条` },
        { status: 400 },
      );
    }

    if (action === "reject" && !String(body.reason || "").trim()) {
      return NextResponse.json({ error: "请填写驳回原因" }, { status: 400 });
    }

    const reason = String(body.reason || "").trim();
    const results: BatchReviewResult[] = [];

    for (const id of ids) {
      const existing = await getRequestById(id);
      const name =
        (existing?.payload as { name?: string } | null)?.name || `#${id}`;
      try {
        if (action === "approve") {
          await approveRequest(id, user);
        } else {
          await rejectRequest(id, user, reason);
        }
        results.push({ id, name, ok: true });
      } catch (e) {
        results.push({
          id,
          name,
          ok: false,
          error: e instanceof Error ? e.message : "处理失败",
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      action,
      okCount,
      failCount: results.length - okCount,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "批量审核失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
