import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertCanAdmitDaikao,
  assertDaikaoAdmittable,
  daikaoToPeoplePayload,
} from "@/lib/daikao";
import { searchPeople } from "@/lib/people";
import { searchTextVariants } from "@/lib/zh";

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

    let parentId: number | null = null;
    let parentCandidates: {
      id: number;
      name: string;
      sex: string;
      level: number | null;
      groupName: string | null;
      parentName: string | null;
    }[] = [];
    let parentMatch: "none" | "unique" | "ambiguous" = "none";

    const parentName = (daikao.parentName || "").trim();
    if (parentName) {
      const found = await searchPeople({ name: parentName, page: 1, pageSize: 50 });
      const variants = new Set(searchTextVariants(parentName));
      const exact = found.items.filter((x) => variants.has(x.name));
      const list = (exact.length ? exact : found.items).map((p) => ({
        id: p.id,
        name: p.name,
        sex: p.sex,
        level: p.level,
        groupName: p.groupName,
        parentName: p.parentName,
      }));
      parentCandidates = list;
      if (exact.length === 1) {
        parentId = exact[0].id;
        parentMatch = "unique";
      } else if (list.length > 1) {
        parentMatch = "ambiguous";
      } else if (list.length === 1) {
        parentId = list[0].id;
        parentMatch = "unique";
      }
    }

    const payload = daikaoToPeoplePayload(daikao, parentId);
    return NextResponse.json({
      daikao,
      payload,
      parentName,
      parentMatch,
      parentCandidates,
    });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 400;
    const msg = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
