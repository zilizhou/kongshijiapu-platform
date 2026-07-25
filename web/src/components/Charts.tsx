"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** 看板图表：偏亮、易区分，避免深棕大块 */
const CHART = {
  bar: "#6aa4e0",
  barSoft: "#9bc4eb",
  line: "#4f8fd4",
  grid: "#e8edf3",
  tick: "#6b7a90",
  tooltipBg: "#ffffff",
  tooltipBorder: "#d7dee8",
  emptyBg: "#f3f6fa",
};

const BAR_TONES = [
  "#6aa4e0",
  "#7eb6e8",
  "#92c3ec",
  "#5b96d4",
  "#83b8e6",
  "#a8cff0",
  "#4f8fd4",
  "#74abe3",
];

const PIE_COLORS = [
  "#6aa4e0",
  "#e88888",
  "#7cb89a",
  "#e0b06a",
  "#9b8fd9",
  "#d49a6b",
];

const SEX_COLORS: Record<string, string> = {
  男: "#6aa4e0",
  女: "#e88888",
};

const REVIEW_COLORS: Record<string, string> = {
  暂存: "#a8b4c4",
  待一审: "#e0b06a",
  待二审: "#9b8fd9",
  待终审: "#6aa4e0",
  已通过: "#7cb89a",
  已驳回: "#e88888",
};

type Point = { name: string; value: number };

function Empty({ text = "暂无数据" }: { text?: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted">
      {text}
    </div>
  );
}

const tipStyle = {
  background: CHART.tooltipBg,
  border: `1px solid ${CHART.tooltipBorder}`,
  borderRadius: 8,
  boxShadow: "0 4px 14px rgba(36,48,68,0.08)",
};

export function LevelBarChart({ data }: { data: Point[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: CHART.tick, fontSize: 11 }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis tick={{ fill: CHART.tick, fontSize: 11 }} />
        <Tooltip
          contentStyle={tipStyle}
          formatter={(v) => [Number(v).toLocaleString(), "人数"]}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={42}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_TONES[i % BAR_TONES.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BranchHBarChart({ data }: { data: Point[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" tick={{ fill: CHART.tick, fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={88}
          tick={{ fill: CHART.tick, fontSize: 11 }}
        />
        <Tooltip
          contentStyle={tipStyle}
          formatter={(v) => [Number(v).toLocaleString(), "人数"]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={i === 0 ? CHART.bar : CHART.barSoft}
              fillOpacity={1 - Math.min(i, 6) * 0.06}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SexPieChart({ data }: { data: Point[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
          label={({ name, percent }) =>
            `${name} ${((percent || 0) * 100).toFixed(0)}%`
          }
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={SEX_COLORS[d.name] || PIE_COLORS[i % PIE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => Number(v).toLocaleString()}
          contentStyle={tipStyle}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function YearLineChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return <Empty text="暂无年度录入数据" />;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        <XAxis dataKey="name" tick={{ fill: CHART.tick, fontSize: 11 }} />
        <YAxis tick={{ fill: CHART.tick, fontSize: 11 }} />
        <Tooltip
          contentStyle={tipStyle}
          formatter={(v) => [Number(v).toLocaleString(), "新增"]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={CHART.line}
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: CHART.line, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ReviewPieChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return (
      <div
        className="flex h-64 flex-col items-center justify-center rounded-xl"
        style={{ background: CHART.emptyBg }}
      >
        <div className="text-sm text-muted">暂无变更单</div>
        <div className="mt-1 text-xs text-muted">提交编修后将显示审核分布</div>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={95}
          paddingAngle={2}
          label={({ name, value }) => `${name} ${value}`}
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={REVIEW_COLORS[d.name] || PIE_COLORS[i % PIE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip formatter={(v) => Number(v).toLocaleString()} contentStyle={tipStyle} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
