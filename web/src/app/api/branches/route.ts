import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listBranchOptions, searchBranches } from "@/lib/branch";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    if (sp.get("options") === "1") {
      const items = await listBranchOptions(sp.get("q") || undefined);
      return NextResponse.json({ items });
    }
    const data = await searchBranches({
      name: sp.get("name") || undefined,
      parentId: sp.get("parentId") ? Number(sp.get("parentId")) : undefined,
      level: sp.get("level") ? Number(sp.get("level")) : undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 10,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST() {
  await requireSession();
  return NextResponse.json(
    { error: "派户支变更须提交审核单（与家谱数据一致），请在页面提交后走一审→二审→终审" },
    { status: 403 },
  );
}
