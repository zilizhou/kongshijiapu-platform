import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDashboardCharts } from "@/lib/people";

export async function GET() {
  try {
    await requireSession();
    const charts = await getDashboardCharts();
    return NextResponse.json(charts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "获取图表失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
