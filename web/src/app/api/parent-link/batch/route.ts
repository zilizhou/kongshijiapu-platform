import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertCanEditParentLink,
  linkQueueToParent,
  previewParentLink,
} from "@/lib/parent-link-queue";

const MAX_BATCH = 50;

export type BatchLinkResult = {
  queueId: number;
  peopleId: number;
  name: string;
  ok: boolean;
  parentId?: number;
  error?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    assertCanEditParentLink(user);
    const body = await req.json();
    const ids = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => Number(x)).filter((n: number) => n > 0)
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "请选择队列项" }, { status: 400 });
    }
    if (ids.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `单次最多 ${MAX_BATCH} 条，当前 ${ids.length} 条` },
        { status: 400 },
      );
    }

    if (body.preview) {
      const items = await previewParentLink(ids);
      return NextResponse.json({ items });
    }

    const parentIdsRaw =
      body.parentIds && typeof body.parentIds === "object"
        ? (body.parentIds as Record<string, unknown>)
        : {};
    const previews = await previewParentLink(ids);
    const results: BatchLinkResult[] = [];
    const operator = user.displayName || user.username;

    for (const item of previews) {
      try {
        if (!item.ok && item.parentMatch !== "ambiguous") {
          throw new Error(item.error || "不可挂接");
        }
        let parentId = item.parentId;
        const override = Number(parentIdsRaw[String(item.queueId)]);
        if (Number.isFinite(override) && override > 0) {
          parentId = override;
        }
        if (!parentId) {
          throw new Error(item.error || "请先选择父亲");
        }
        await linkQueueToParent({
          peopleId: item.peopleId,
          parentId,
          operatorName: operator,
          matchHint: item.parentMatch === "unique" ? "unique" : "manual",
        });
        results.push({
          queueId: item.queueId,
          peopleId: item.peopleId,
          name: item.name,
          ok: true,
          parentId,
        });
      } catch (e) {
        results.push({
          queueId: item.queueId,
          peopleId: item.peopleId,
          name: item.name,
          ok: false,
          error: e instanceof Error ? e.message : "挂接失败",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "批量挂接失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
