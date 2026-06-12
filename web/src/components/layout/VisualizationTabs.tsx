import { useLocale, type TranslationKey } from "../../lib/i18n";
import type { AnalysisIssue, AnalysisResult, IssueType } from "../../lib/types";
import { FileMetricsChart } from "../charts/FileMetricsChart";
import { IssueDistributionChart } from "../charts/IssueDistributionChart";
import { PriorityRankingChart } from "../charts/PriorityRankingChart";
import { SeverityBreakdownChart } from "../charts/SeverityBreakdownChart";
import { DependencyGraph } from "../graph/DependencyGraph";

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
      </div>
    </div>
  );
}
