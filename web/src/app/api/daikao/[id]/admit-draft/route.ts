import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertCanAdmitDaikao,
  assertDaikaoAdmittable,
  daikaoToPeoplePayload,
  resolveOfficialParent,
} from "@/lib/daikao";

/** 预填入谱表单：待考 → PeoplePayload，并尝试匹配正式库父亲 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    assertCanAdmitDaikao(user);
    const { id } = await ctx.params;
    const daikao = await assertDaikaoAdmittable(Number(id));
    const parent = await resolveOfficialParent(daikao.parentName);
    const payload = daikaoToPeoplePayload(daikao, parent.parentId);
    return NextResponse.json({
      daikao,
      payload,
      parentName: parent.parentName,
      parentMatch: parent.parentMatch,
      parentCandidates: parent.parentCandidates,
    });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 400;
    const msg = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
