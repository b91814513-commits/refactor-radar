import { useMemo } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { AnalysisIssue, IssueType } from "../../lib/types";

interface IssueDistributionChartProps {
  issues: AnalysisIssue[];
  onTypeClick?: (type: IssueType) => void;
}

const TYPE_COLORS: Record<IssueType, string> = {
  large_module: "#8b5cf6",
  dependency_hotspot: "#f59e0b",
  circular_dependency: "#ef4444",
  duplication_candidate: "#3b82f6",
};

const TYPE_LABELS: Record<IssueType, string> = {
  large_module: "Large Module",
  dependency_hotspot: "Dependency Hotspot",
  circular_dependency: "Circular Dependency",
  duplication_candidate: "Duplication Candidate",
};

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: { fill: string };
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

export function IssueDistributionChart({
  issues,
  onTypeClick,
}: IssueDistributionChartProps) {
  const data = useMemo(() => {
    const counts: Partial<Record<IssueType, number>> = {};
    for (const issue of issues) {
      counts[issue.issueType] = (counts[issue.issueType] ?? 0) + 1;
    }
    return (Object.keys(counts) as IssueType[]).map((type) => ({
      name: TYPE_LABELS[type],
      type,
      value: counts[type]!,
      fill: TYPE_COLORS[type],
    }));
  }, [issues]);

  const typeByName = useMemo(() => {
    const map: Record<string, IssueType> = {};
    for (const [key, label] of Object.entries(TYPE_LABELS) as [IssueType, string][]) {
      map[label] = key;
    }
    return map;
  }, []);

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>No issues to display.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="chart-title">Issue Types</h4>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            onClick={(entry) => {
              if (onTypeClick && entry?.name) {
                const issueType = typeByName[entry.name as string];
                if (issueType) onTypeClick(issueType);
              }
            }}
            style={{ cursor: onTypeClick ? "pointer" : "default" }}
          >
            {data.map((entry) => (
              <Cell key={entry.type} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "0.75rem", color: "#a0aec0" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
