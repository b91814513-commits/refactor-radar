import { useMemo, useState } from "react";
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

import { useLocale, type TranslationKey } from "../../lib/i18n";
import type { AnalyzedFile } from "../../lib/types";

type MetricKey = "lineCount" | "functionCount" | "fanIn" | "fanOut";

interface FileMetricsChartProps {
  files: AnalyzedFile[];
}

const METRIC_I18N: { key: MetricKey; label: TranslationKey }[] = [
  { key: "lineCount", label: "metric.lines" },
  { key: "functionCount", label: "metric.functions" },
  { key: "fanIn", label: "metric.fanIn" },
  { key: "fanOut", label: "metric.fanOut" },
];

const BAR_COLOR = "#3b82f6";
const BAR_HIGHLIGHT_COLOR = "#f59e0b";

interface TooltipPayloadEntry {
  value: number;
  payload: { name: string; fullPath: string };
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip-label" title={entry.payload.fullPath}>
        {label ?? entry.payload.fullPath}
      </span>
      <span className="chart-tooltip-value">{entry.value}</span>
    </div>
  );
}

export function FileMetricsChart({ files }: FileMetricsChartProps) {
  const { t } = useLocale();
  const [metric, setMetric] = useState<MetricKey>("lineCount");

  const data = useMemo(() => {
    return [...files]
      .sort((a, b) => b.metrics[metric] - a.metrics[metric])
      .slice(0, 15)
      .map((file) => {
        const basename = file.path.split("/").pop() ?? file.path;
        return {
          name: basename.length > 18 ? basename.slice(0, 15) + "\u2026" : basename,
          fullPath: file.path,
          value: file.metrics[metric],
        };
      });
  }, [files, metric]);

  if (files.length === 0) {
    return (
      <div className="chart-empty">
        <p>{t("chart.noFiles")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="chart-header-row">
        <h4 className="chart-title">{t("chart.topFiles")}</h4>
        <div className="metric-selector">
          {METRIC_I18N.map((opt) => (
            <button
              key={opt.key}
              className={metric === opt.key ? "metric-btn active" : "metric-btn"}
              onClick={() => setMetric(opt.key)}
            >
              {t(opt.label)}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 16, left: 0, bottom: 40 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#293042" />
          <XAxis
            dataKey="name"
            tick={{ fill: "#8fa3bf", fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
            axisLine={{ stroke: "#293042" }}
          />
          <YAxis
            tick={{ fill: "#8fa3bf", fontSize: 11 }}
            axisLine={{ stroke: "#293042" }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(125, 211, 252, 0.06)" }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={index === 0 ? BAR_HIGHLIGHT_COLOR : BAR_COLOR}
                opacity={Math.max(0.5, 1 - index * 0.04)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
