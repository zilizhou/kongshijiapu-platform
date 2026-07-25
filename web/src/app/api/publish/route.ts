import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { buildPublishByBranch, buildPublishByPerson } from "@/lib/publish";

function parseLimit(raw: string | null): number | "all" {
  const v = (raw || "100").trim().toLowerCase();
  if (v === "all" || v === "全部") return "all";
  const n = Number(v);
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(20000, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const mode = sp.get("mode") || "person";

    if (mode === "branch") {
      const group = (sp.get("group") || "").trim();
      if (!group) {
        return NextResponse.json({ error: "请选择派户支" }, { status: 400 });
      }
      const limit = parseLimit(sp.get("limit"));
      const data = await buildPublishByBranch(group, limit);
      return NextResponse.json(data);
    }

    const personId = Number(sp.get("personId") || 0);
    if (!personId) {
      return NextResponse.json({ error: "请选择起始人物" }, { status: 400 });
    }
    const up = sp.get("up") ? Number(sp.get("up")) : 3;
    const down = sp.get("down") ? Number(sp.get("down")) : 3;
    const data = await buildPublishByPerson(personId, up, down);
    if (!data) {
      return NextResponse.json({ error: "未找到该人物" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
