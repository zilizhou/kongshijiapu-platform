import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getParentLinkStats } from "@/lib/parent-link-queue";
import { getDashboardStats } from "@/lib/people";
import { listRequests } from "@/lib/workflow";

export async function GET() {
  try {
    const user = await requireSession();
    const stats = await getDashboardStats();
    const parentLink = await getParentLinkStats();
    const mine = await listRequests({ user, mode: "mine", pageSize: 1 });
    const review = await listRequests({ user, mode: "review", pageSize: 1 });
    return NextResponse.json({
      ...stats,
      parentLinkPending: parentLink.pending,
      parentLinkTotal: parentLink.total,
      myPending: mine.total,
      reviewPending: review.total,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "获取统计失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
