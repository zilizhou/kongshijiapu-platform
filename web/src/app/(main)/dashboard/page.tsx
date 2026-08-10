"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import {
  BranchHBarChart,
  LevelBarChart,
  ReviewPieChart,
  SexPieChart,
  YearLineChart,
} from "@/components/Charts";
import { Button, Card, PageHeader } from "@/components/ui";
import type { SessionUser } from "@/lib/types";

type Stats = {
  peopleTotal: number;
  branchTotal: number;
  daikaoTotal: number;
  daikaoFile1: number;
  daikaoFile2: number;
  daikaoMale: number;
  daikaoFemale: number;
  daikaoRoots: number;
  daikaoErrors: number;
  draft: number;
  pending_1: number;
  pending_2: number;
  pending_final: number;
  rejected: number;
  approved: number;
  myPending: number;
  reviewPending: number;
};

type Charts = {
  levelBuckets: { name: string; value: number }[];
  branchTop: { name: string; value: number; meta?: string }[];
  sexPie: { name: string; value: number }[];
  yearTrend: { name: string; value: number }[];
  reviewPie: { name: string; value: number }[];
  stale?: boolean;
  cachedAt?: string;
};

function StatBlock({
  title,
  total,
  rows,
  accent = "border-t-sidebar",
}: {
  title: string;
  total: number;
  rows: { label: string; value: number; tone?: string }[];
  accent?: string;
}) {
  return (
    <Card className={`overflow-hidden border-t-4 p-5 ${accent}`}>
      <div className="flex items-baseline justify-between">
        <div className="font-display text-lg">{title}</div>
        <div className="text-sm text-muted">总量</div>
      </div>
      <div className="mt-2 font-display text-4xl tracking-wide text-accent">
        {total.toLocaleString()}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded-lg bg-soft px-3 py-2"
          >
            <span className="text-muted">{r.label}</span>
            <span className={`font-medium ${r.tone || ""}`}>
              {r.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg">{title}</div>
          {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState("");
  const [chartsLoading, setChartsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 20_000);
    setChartsLoading(true);
    setError("");

    Promise.all([
      fetch("/api/stats", { signal: ac.signal }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "加载失败");
        return d as Stats;
      }),
      fetch("/api/stats/charts", { signal: ac.signal }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "图表加载失败");
        return d as Charts;
      }),
    ])
      .then(([s, c]) => {
        setStats(s);
        setCharts(c);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") {
          setError("加载超时，请刷新重试");
        } else {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
        setChartsLoading(false);
      });

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, []);

  const canReview = ["first", "second", "final", "admin"].includes(
    user?.role || "",
  );
  const canEdit = user?.role === "editor" || user?.role === "admin";

  const reviewing =
    (stats?.pending_1 || 0) +
    (stats?.pending_2 || 0) +
    (stats?.pending_final || 0);

  return (
    <div>
      <PageHeader
        title="数据统计看板"
        desc={
          charts?.stale
            ? "成员规模、代数分布与审核积压一览（图表缓存刷新中）"
            : "成员规模、代数分布与审核积压一览"
        }
        actions={
          <div className="flex gap-2">
            <Link href="/people">
              <Button variant="secondary">家谱管理</Button>
            </Link>
            <Link href="/daikao">
              <Button variant="secondary">待考管理</Button>
            </Link>
            {canEdit ? (
              <Link href="/edit">
                <Button>我的编修</Button>
              </Link>
            ) : null}
            {canReview ? (
              <Link href="/review">
                <Button variant="soft">去审核</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {error ? (
        <Card className="p-4 text-accent">{error}</Card>
      ) : (
        <>
          <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatBlock
              title="人员"
              accent="border-t-sidebar"
              total={stats?.peopleTotal || 0}
              rows={[
                {
                  label: "已通过",
                  value: stats?.peopleTotal || 0,
                  tone: "text-ok",
                },
                {
                  label: "已驳回",
                  value: stats?.rejected || 0,
                  tone: "text-danger",
                },
                { label: "审核中", value: reviewing },
                { label: "待一审", value: stats?.pending_1 || 0 },
                { label: "待二审", value: stats?.pending_2 || 0 },
                { label: "待终审", value: stats?.pending_final || 0 },
              ]}
            />
            <StatBlock
              title="待考人员"
              accent="border-t-accent"
              total={stats?.daikaoTotal || 0}
              rows={[
                { label: "待攷支一", value: stats?.daikaoFile1 || 0 },
                { label: "待攷支二", value: stats?.daikaoFile2 || 0 },
                { label: "男性", value: stats?.daikaoMale || 0 },
                { label: "女性", value: stats?.daikaoFemale || 0 },
                { label: "支根", value: stats?.daikaoRoots || 0 },
                {
                  label: "解析失败",
                  value: stats?.daikaoErrors || 0,
                  tone:
                    (stats?.daikaoErrors || 0) > 0 ? "text-danger" : undefined,
                },
              ]}
            />
            <StatBlock
              title="派户支"
              accent="border-t-warn"
              total={stats?.branchTotal || 0}
              rows={[
                {
                  label: "已通过",
                  value: stats?.branchTotal || 0,
                  tone: "text-ok",
                },
                { label: "已驳回", value: 0, tone: "text-danger" },
                { label: "审核中", value: 0 },
                { label: "待一审", value: 0 },
                { label: "待二审", value: 0 },
                { label: "待终审", value: 0 },
              ]}
            />
            <StatBlock
              title="待办 / 变更单"
              accent="border-t-ok"
              total={(stats?.myPending || 0) + (stats?.reviewPending || 0)}
              rows={[
                { label: "我的编修", value: stats?.myPending || 0 },
                { label: "待我审核", value: stats?.reviewPending || 0 },
                { label: "暂存", value: stats?.draft || 0 },
                { label: "已通过单", value: stats?.approved || 0 },
                { label: "已驳回单", value: stats?.rejected || 0 },
                { label: "审核中单", value: reviewing },
              ]}
            />
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="家谱成员代数分布"
              hint="点击「家谱管理」可按世代筛选查看"
              action={
                <Link href="/people">
                  <Button variant="secondary" className="px-2 py-1 text-xs">
                    查看详情
                  </Button>
                </Link>
              }
            >
              {chartsLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted">
                  图表加载中...
                </div>
              ) : (
                <LevelBarChart data={charts?.levelBuckets || []} />
              )}
            </ChartCard>

            <ChartCard
              title="派户支成员统计 TOP10"
              hint="按派户支首段名称汇总"
              action={
                <Link href="/people">
                  <Button className="px-2 py-1 text-xs">查看详情</Button>
                </Link>
              }
            >
              {chartsLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted">
                  图表加载中...
                </div>
              ) : (
                <BranchHBarChart data={charts?.branchTop || []} />
              )}
            </ChartCard>
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-3">
            <ChartCard title="性别比例" hint="饼图直观对比男女占比">
              {chartsLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted">
                  图表加载中...
                </div>
              ) : (
                <SexPieChart data={charts?.sexPie || []} />
              )}
            </ChartCard>
            <ChartCard title="年度成员增长趋势" hint="按录入年份统计">
              {chartsLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted">
                  图表加载中...
                </div>
              ) : (
                <YearLineChart data={charts?.yearTrend || []} />
              )}
            </ChartCard>
            <ChartCard title="变更单审核分布" hint="编修流程各阶段数量">
              {chartsLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted">
                  图表加载中...
                </div>
              ) : (
                <ReviewPieChart data={charts?.reviewPie || []} />
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <div className="font-display text-lg">快捷入口</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Link
                  href="/people"
                  className="rounded-xl border border-line bg-soft px-4 py-4 hover:border-accent/40"
                >
                  <div className="font-medium">家谱管理</div>
                  <div className="mt-1 text-xs text-muted">
                    筛选、展开子代、世系图 / 一字图
                  </div>
                </Link>
                <Link
                  href="/branches"
                  className="rounded-xl border border-line bg-soft px-4 py-4 hover:border-accent/40"
                >
                  <div className="font-medium">派户支管理</div>
                  <div className="mt-1 text-xs text-muted">
                    浏览派 / 户 / 支层级，维护始迁祖与卷册
                  </div>
                </Link>
                {canEdit ? (
                  <Link
                    href="/edit/new"
                    className="rounded-xl border border-line bg-soft px-4 py-4 hover:border-accent/40"
                  >
                    <div className="font-medium">新增成员</div>
                    <div className="mt-1 text-xs text-muted">
                      提交后进入审核流程
                    </div>
                  </Link>
                ) : null}
                {canReview ? (
                  <Link
                    href="/review"
                    className="rounded-xl border border-line bg-soft px-4 py-4 hover:border-accent/40"
                  >
                    <div className="font-medium">信息审核</div>
                    <div className="mt-1 text-xs text-muted">
                      一审 / 二审 / 终审
                    </div>
                  </Link>
                ) : (
                  <div className="rounded-xl border border-dashed border-line bg-soft/60 px-4 py-4 opacity-70">
                    <div className="font-medium text-muted">信息审核</div>
                    <div className="mt-1 text-xs text-muted">无权限</div>
                  </div>
                )}
                <Link
                  href="/records"
                  className="rounded-xl border border-line bg-soft px-4 py-4 hover:border-accent/40"
                >
                  <div className="font-medium">工作记录</div>
                  <div className="mt-1 text-xs text-muted">追踪操作与审核流水</div>
                </Link>
              </div>
            </Card>
            <Card className="p-5">
              <div className="font-display text-lg">图谱说明</div>
              <ol className="mt-4 space-y-3 text-sm text-muted">
                <li className="rounded-lg bg-soft px-3 py-3">
                  <span className="font-medium text-ink">世系图：</span>
                  树形展示祖先与子嗣分支。
                </li>
                <li className="rounded-lg bg-soft px-3 py-3">
                  <span className="font-medium text-ink">一字图：</span>
                  自当前人上溯、下延各若干代，直系成一条线（向下沿长子支）。
                </li>
                <li className="rounded-lg bg-soft px-3 py-3">
                  在「家谱管理」列表操作列点击对应按钮即可打开。
                </li>
                <li className="rounded-lg bg-soft px-3 py-3">
                  审核流：录入 → 一审 → 二审 → 终审（终审也可直接审录入员提交的单），驳回退回录入员。
                </li>
              </ol>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
