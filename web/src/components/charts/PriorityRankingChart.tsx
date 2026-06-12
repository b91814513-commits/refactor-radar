import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useLocale } from "../../lib/i18n";
import type { AnalysisIssue, Severity } from "../../lib/types";

interface PriorityRankingChartProps {
  issues: AnalysisIssue[];
  onIssueClick?: (issueId: string) => void;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

interface ChartDatum {
  id: string;
  title: string;
  score: number;
  severity: Severity;
  fill: string;
}

interface TooltipPayloadEntry {
  value: number;
  payload: ChartDatum;
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
      <span className="chart-tooltip-label">{entry.payload.title}</span>
      <span className="chart-tooltip-value">{entry.value.toFixed(1)}</span>
    </div>
  );
}

export function PriorityRankingChart({
  issues,
  onIssueClick,
}: PriorityRankingChartProps) {
  const { t } = useLocale();

  const data = useMemo(() => {
    return [...issues]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 10)
      .map((issue) => {
        const basename =
          issue.files[0]?.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "unknown";
        const typeShort = issue.issueType.replace(/_/g, " ").slice(0, 16);
        const title = `${typeShort}: ${basename}`;
        return {
          id: issue.id,
          title: title.length > 32 ? title.slice(0, 29) + "\u2026" : title,
          score: Math.round(issue.priorityScore * 10) / 10,
          severity: issue.severity,
          fill: SEVERITY_COLORS[issue.severity],
        };
      });
  }, [issues]);

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>{t("chart.noIssues")}</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="chart-title">{t("chart.priorityRanking")}</h4>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#293042" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#8fa3bf", fontSize: 11 }}
            axisLine={{ stroke: "#293042" }}
            domain={[0, "auto"]}
          />
          <YAxis
            type="category"
            dataKey="title"
            tick={{ fill: "#a0aec0", fontSize: 11 }}
            axisLine={{ stroke: "#293042" }}
            width={200}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(125, 211, 252, 0.06)" }} />
          <Bar
            dataKey="score"
            radius={[0, 4, 4, 0]}
            onClick={(entry) => {
              if (onIssueClick && entry?.id) {
                onIssueClick(entry.id as string);
              }
            }}
            style={{ cursor: onIssueClick ? "pointer" : "default" }}
          >
            {data.map((entry) => (
              <Cell key={entry.id} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
