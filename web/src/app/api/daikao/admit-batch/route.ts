import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertCanAdmitDaikao,
  assertDaikaoAdmittable,
  daikaoToPeoplePayload,
  previewDaikaoAdmit,
  resolveOfficialParent,
} from "@/lib/daikao";
import { getPeopleById } from "@/lib/people";
import { createRequest } from "@/lib/workflow";

const MAX_BATCH = 50;

export type BatchAdmitResult = {
  id: number;
  name: string;
  ok: boolean;
  requestId?: number;
  error?: string;
};

/** 预览：POST { preview: true, ids: number[] } */
/** 提交：POST { ids, parentIds?: Record<string,number>, submit?: boolean } */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    assertCanAdmitDaikao(user);
    const body = await req.json();
    const ids = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => Number(x)).filter((n: number) => n > 0)
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "请选择待考成员" }, { status: 400 });
    }
    if (ids.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `单次最多 ${MAX_BATCH} 人，当前 ${ids.length} 人` },
        { status: 400 },
      );
    }

    if (body.preview) {
      const items = await previewDaikaoAdmit(ids);
      return NextResponse.json({ items });
    }

    const submit = Boolean(body.submit);
    const parentIdsRaw =
      body.parentIds && typeof body.parentIds === "object"
        ? (body.parentIds as Record<string, unknown>)
        : {};
    const results: BatchAdmitResult[] = [];

    for (const id of ids) {
      try {
        const row = await assertDaikaoAdmittable(id);
        const group =
          row.groupRaw ||
          [row.group1, row.group2, row.group3].filter(Boolean).join(",") ||
          "";
        if (!row.name?.trim()) throw new Error("姓名为空");
        if (!group.trim()) throw new Error("缺少所属派户支");

        let parentId: number | null = null;
        const override = Number(parentIdsRaw[String(id)]);
        if (Number.isFinite(override) && override > 0) {
          const p = await getPeopleById(override);
          if (!p) throw new Error(`所选父亲 ID ${override} 不存在`);
          parentId = override;
        } else {
          const parent = await resolveOfficialParent(row.parentName);
          if (parent.parentMatch === "ambiguous") {
            throw new Error(`父亲「${parent.parentName}」重名，请先选择`);
          }
          parentId = parent.parentId;
        }

        const payload = daikaoToPeoplePayload(row, parentId);
        const created = await createRequest({
          user,
          objectType: "people",
          operation: "create",
          objectId: null,
          payload,
          submit,
        });
        results.push({
          id,
          name: row.name,
          ok: true,
          requestId: created?.id,
        });
      } catch (e) {
        results.push({
          id,
          name: "",
          ok: false,
          error: e instanceof Error ? e.message : "入谱失败",
        });
      }
    }

    return NextResponse.json({
      total: results.length,
      okCount: results.filter((r) => r.ok).length,
      failCount: results.filter((r) => !r.ok).length,
      submit,
      results,
    });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 400;
    const msg = e instanceof Error ? e.message : "批量入谱失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
