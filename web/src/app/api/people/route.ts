import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { searchPeople } from "@/lib/people";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const exactNameRaw = (sp.get("exactName") || "").toLowerCase();
    const data = await searchPeople({
      q: sp.get("q") || undefined,
      name: sp.get("name") || undefined,
      exactName: ["1", "true", "yes"].includes(exactNameRaw),
      fatherName: sp.get("fatherName") || undefined,
      grandfatherName: sp.get("grandfatherName") || undefined,
      pinyin: sp.get("pinyin") || undefined,
      ziHao: sp.get("ziHao") || undefined,
      no: sp.get("no") || undefined,
      level: sp.get("level") ? Number(sp.get("level")) : undefined,
      group: sp.get("group") || undefined,
      sex: sp.get("sex") || undefined,
      address: sp.get("address") || undefined,
      idCard: sp.get("idCard") || undefined,
      parentId: sp.get("parentId") ? Number(sp.get("parentId")) : undefined,
      auditStatus: sp.get("auditStatus") || undefined,
      dataSource:
        sp.get("dataSource") === "legacy" || sp.get("dataSource") === "platform"
          ? (sp.get("dataSource") as "legacy" | "platform")
          : undefined,
      feeStatus:
        sp.get("feeStatus") === "paid" || sp.get("feeStatus") === "unpaid"
          ? (sp.get("feeStatus") as "paid" | "unpaid")
          : undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 10,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
