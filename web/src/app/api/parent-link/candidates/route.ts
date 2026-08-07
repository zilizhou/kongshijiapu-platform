import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { searchParentCandidates } from "@/lib/parent-link-queue";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const name = sp.get("name") || "";
    const childPeopleId = sp.get("childPeopleId")
      ? Number(sp.get("childPeopleId"))
      : undefined;
    const data = await searchParentCandidates({
      name,
      childPeopleId,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 50,
    });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status });
  }
}
