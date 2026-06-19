import { lazy, Suspense } from "react";

import { useLocale, type TranslationKey } from "../../lib/i18n";
import type { AnalysisResult, IssueType } from "../../lib/types";

// Lazy-load the heavy chart + graph components so recharts and d3-force stay
// out of the initial bundle. Each chunk is fetched only when its tab is opened.
const IssueDistributionChart = lazy(() =>
  import("../charts/IssueDistributionChart").then((m) => ({ default: m.IssueDistributionChart })),
);
const SeverityBreakdownChart = lazy(() =>
  import("../charts/SeverityBreakdownChart").then((m) => ({ default: m.SeverityBreakdownChart })),
);
const FileMetricsChart = lazy(() =>
  import("../charts/FileMetricsChart").then((m) => ({ default: m.FileMetricsChart })),
);
const PriorityRankingChart = lazy(() =>
  import("../charts/PriorityRankingChart").then((m) => ({ default: m.PriorityRankingChart })),
);
const DependencyGraph = lazy(() =>
  import("../graph/DependencyGraph").then((m) => ({ default: m.DependencyGraph })),
);

export type VizTab = "overview" | "files" | "priority" | "graph";

interface VisualizationTabsProps {
  activeTab: VizTab;
  onTabChange: (tab: VizTab) => void;
  results: AnalysisResult;
  onTypeClick?: (type: IssueType) => void;
  onIssueClick?: (issueId: string) => void;
  onNodeClick?: (filePath: string) => void;
}

const TAB_KEYS: VizTab[] = ["overview", "files", "priority", "graph"];
const TAB_I18N: Record<VizTab, TranslationKey> = {
  overview: "tab.overview",
  files: "tab.files",
  priority: "tab.priority",
  graph: "tab.graph",
};

export function VisualizationTabs({
  activeTab,
  onTabChange,
  results,
  onTypeClick,
  onIssueClick,
  onNodeClick,
}: VisualizationTabsProps) {
  const { t } = useLocale();

  return (
    <div className="viz-section">
      <div className="viz-tabs">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            className={activeTab === key ? "viz-tab active" : "viz-tab"}
            onClick={() => onTabChange(key)}
          >
            {t(TAB_I18N[key])}
          </button>
        ))}
      </div>

      <div className="viz-container">
        <Suspense fallback={<div className="chart-loading">{t("chart.loading")}</div>}>
          {activeTab === "overview" && (
            <div className="chart-row">
              <IssueDistributionChart
                issues={results.issues}
                onTypeClick={onTypeClick}
              />
              <SeverityBreakdownChart issues={results.issues} />
            </div>
          )}

          {activeTab === "files" && (
            <FileMetricsChart files={results.files} />
          )}

          {activeTab === "priority" && (
            <PriorityRankingChart
              issues={results.issues}
              onIssueClick={onIssueClick}
            />
          )}

          {activeTab === "graph" && (
            <DependencyGraph
              files={results.files}
              issues={results.issues}
              onNodeClick={onNodeClick}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
