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

const TABS: { key: VizTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "files", label: "Files" },
  { key: "priority", label: "Priority" },
  { key: "graph", label: "Dependency Graph" },
];

export function VisualizationTabs({
  activeTab,
  onTabChange,
  results,
  onTypeClick,
  onIssueClick,
  onNodeClick,
}: VisualizationTabsProps) {
  return (
    <div className="viz-section">
      <div className="viz-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "viz-tab active" : "viz-tab"}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
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
