import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { canAdmitDaikaoRow, searchDaikao } from "@/lib/daikao";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const exactNameRaw = (sp.get("exactName") || "").toLowerCase();
    const data = await searchDaikao({
      name: sp.get("name") || sp.get("q") || undefined,
      no: sp.get("no") || undefined,
      level: sp.get("level") || undefined,
      group: sp.get("group") || undefined,
      sourceFile: sp.get("sourceFile") || undefined,
      volume: sp.get("volume") || undefined,
      section: sp.get("section") || undefined,
      admitStatus: sp.get("admitStatus") || undefined,
      exactName: ["1", "true", "yes"].includes(exactNameRaw),
      parentId: sp.get("parentId") ? Number(sp.get("parentId")) : undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 10,
    });
    return NextResponse.json({
      ...data,
      items: data.items.map((d) => ({
        ...d,
        groupName: d.groupRaw,
        no: d.spectrumNo,
        level: d.generation,
        canAdmit: canAdmitDaikaoRow(d),
      })),
    });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
