import { useMemo } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { AnalysisIssue, Severity } from "../../lib/types";

interface SeverityBreakdownChartProps {
  issues: AnalysisIssue[];
}

const SEVERITY_COLORS: Record<Severity, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

interface TooltipPayloadEntry {
  name: string;
  value: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip-label">{entry.name}</span>
      <span className="chart-tooltip-value">{entry.value} issues</span>
    </div>
  );
}

export function SeverityBreakdownChart({
  issues,
}: SeverityBreakdownChartProps) {
  const { data, total } = useMemo(() => {
    const counts: Partial<Record<Severity, number>> = {};
    for (const issue of issues) {
      counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
    }
    const total = issues.length;
    const data = (Object.keys(counts) as Severity[])
      .sort((a, b) => {
        const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
        return order[a] - order[b];
      })
      .map((severity) => ({
        name: SEVERITY_LABELS[severity],
        severity,
        value: counts[severity]!,
        fill: SEVERITY_COLORS[severity],
      }));
    return { data, total };
  }, [issues]);

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>No issues to display.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="chart-title">Severity Breakdown</h4>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.severity} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <text
            x="50%"
            y="46%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#edf2f7"
            fontSize={22}
            fontWeight="bold"
          >
            {total}
          </text>
          <text
            x="50%"
            y="58%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#8fa3bf"
            fontSize={10}
          >
            issues
          </text>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
