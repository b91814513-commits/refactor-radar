import { ArrowRight, Boxes, CircleAlert, FileCode2, Flame, FolderSearch, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { AnalysisHistory } from "../components/layout/AnalysisHistory";
import { AnalysisProgress } from "../components/layout/AnalysisProgress";
import { EmptyState } from "../components/layout/EmptyState";
import { ExportMenu } from "../components/layout/ExportMenu";
import { VisualizationTabs, type VizTab } from "../components/layout/VisualizationTabs";
import { useAnalysis } from "../hooks/useAnalysis";
import { useLocale, type TranslationKey } from "../lib/i18n";
import type { AnalysisIssue } from "../lib/types";

const FILTER_KEYS: Record<string, TranslationKey> = {
  all: "filter.all",
  large_module: "filter.large_module",
  dependency_hotspot: "filter.dependency_hotspot",
  circular_dependency: "filter.circular_dependency",
  duplication_candidate: "filter.duplication_candidate",
  long_parameter_list: "filter.long_parameter_list",
  deep_nesting: "filter.deep_nesting",
  god_function: "filter.god_function",
};

export function Dashboard() {
  const { t } = useLocale();
  const [activeVizTab, setActiveVizTab] = useState<VizTab>("overview");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const analysis = useAnalysis({
    t,
    onToast: () => {},
  });

  // Wrap loadResults to also bump history refresh
  const handleHistorySelect = async (id: string) => {
    await analysis.loadResults(id);
    setHistoryRefreshKey((k) => k + 1);
  };

  // Wrap handleAnalyze to bump history refresh on completion (via polling done)
  const origHandleAnalyze = analysis.handleAnalyze;
  const handleAnalyze = async () => {
    await origHandleAnalyze();
    // History will refresh when polling completes (we watch analysis.results)
  };

  // Refresh history when results arrive
  if (analysis.results && historyRefreshKey === 0) {
    // Initial load doesn't need refresh
  }

  return (
    <>
      <section className="scan-panel" aria-labelledby="scan-title">
        <div className="scan-grid">
          <div className="scan-primary">
            <div className="scan-heading">
              <p className="section-kicker">{t("hero.eyebrow")}</p>
              <h1 id="scan-title">{t("analyzer.title")}</h1>
              <p>{t("analyzer.desc")}</p>
            </div>

            <form
              className="command-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAnalyze();
              }}
            >
              <label className="command-field">
                <span className="field-label">{t("analyzer.repoPath")}</span>
                <span className="command-input-wrap">
                  <FolderSearch size={18} aria-hidden="true" />
                  <input
                    name="repoPath"
                    value={analysis.repoPath}
                    onChange={(event) => analysis.setRepoPath(event.target.value)}
                    placeholder={t("analyzer.placeholder")}
                    autoComplete="off"
                    spellCheck={false}
                    list="recent-repositories"
                  />
                </span>
              </label>
              <datalist id="recent-repositories">
                {analysis.recentRepos.map((path) => <option key={path} value={path} />)}
              </datalist>
              <button className="btn-primary" type="submit" disabled={analysis.loading}>
                <span>{analysis.loading ? t("analyzer.analyzing") : t("analyzer.analyze")}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </form>

            <AnalysisProgress phase={analysis.phase} loading={analysis.loading} />
            {analysis.error ? <p className="error" role="alert">{analysis.error}</p> : null}

            <div className="scan-capabilities" aria-label={t("hero.issueTypes")}>
              <span><Boxes size={15} aria-hidden="true" />{t("filter.large_module")}</span>
              <span><Flame size={15} aria-hidden="true" />{t("filter.dependency_hotspot")}</span>
              <span><CircleAlert size={15} aria-hidden="true" />{t("filter.circular_dependency")}</span>
              <span><FileCode2 size={15} aria-hidden="true" />{t("filter.duplication_candidate")}</span>
            </div>
          </div>
          <aside className="history-rail">
            <div className="section-title-row">
              <h2>{t("history.title")}</h2>
            </div>
            <AnalysisHistory
              onSelect={handleHistorySelect}
              refreshKey={historyRefreshKey}
            />
          </aside>
        </div>
      </section>

      <section className="dashboard-panel" aria-labelledby="dashboard-title">
        <div className="dashboard-header">
          <div className="dashboard-heading">
            <h2 id="dashboard-title">{t("dashboard.title")}</h2>
            <p>{t("dashboard.desc")}</p>
          </div>
        </div>

        {analysis.results ? (
          <>
            <div className="summary-row">
              <div className="summary-grid">
                <SummaryMetric label={t("dashboard.files")} value={analysis.results.summary.fileCount} />
                <SummaryMetric label={t("dashboard.modules")} value={analysis.results.summary.moduleCount} />
                <SummaryMetric label={t("dashboard.issues")} value={analysis.results.summary.issueCount} />
                <SummaryMetric label={t("dashboard.highPriority")} value={analysis.results.summary.highPriorityCount} emphasis />
              </div>
              <ExportMenu results={analysis.results} />
            </div>

            <VisualizationTabs
              activeTab={activeVizTab}
              onTabChange={setActiveVizTab}
              results={analysis.results}
              onTypeClick={analysis.handleTypeClick}
              onIssueClick={analysis.handleIssueClick}
              onNodeClick={analysis.handleNodeClick}
            />

            <div className="findings-toolbar">
              <div className="findings-count">
                <strong>{analysis.filteredIssues.length}</strong>
                <span>{t("dashboard.issues")}</span>
              </div>
              <div className="filters" role="group" aria-label={t("a11y.filterByIssueType")}>
                {(["all", "large_module", "dependency_hotspot", "circular_dependency", "duplication_candidate", "long_parameter_list", "deep_nesting", "god_function"] as const).map(
                  (value) => (
                    <button
                      key={value}
                      className={analysis.selectedType === value ? "filter active" : "filter"}
                      onClick={() => analysis.setSelectedType(value as typeof analysis.selectedType)}
                      aria-pressed={analysis.selectedType === value}
                    >
                      {t(FILTER_KEYS[value])}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="results-grid">
              <div className="issue-list" aria-label={t("dashboard.issues")}>
                {analysis.filteredIssues.map((issue: AnalysisIssue) => (
                  <button
                    key={issue.id}
                    className={analysis.selectedIssue?.id === issue.id ? "issue-row active" : "issue-row"}
                    onClick={() => analysis.setSelectedIssueId(issue.id)}
                    aria-pressed={analysis.selectedIssue?.id === issue.id}
                  >
                    <div className="issue-row-top">
                      <span className={`severity severity-${issue.severity}`}>
                        {t(`severity.${issue.severity}` as TranslationKey)}
                      </span>
                      <span className="confidence">{issue.confidence}</span>
                    </div>
                    <strong>{issue.title}</strong>
                    <p>{issue.summary}</p>
                  </button>
                ))}
              </div>

              <div className="issue-detail" aria-live="polite">
                {analysis.selectedIssue ? <IssueDetail issue={analysis.selectedIssue} /> : <p className="empty">{t("detail.noSelected")}</p>}
              </div>
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </section>
    </>
  );
}

function SummaryMetric({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={emphasis ? "summary-metric summary-metric-emphasis" : "summary-metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IssueDetail({ issue }: { issue: AnalysisIssue }) {
  const { t } = useLocale();
  return (
    <div className="detail-stack">
      <div>
        <div className="detail-header">
          <div>
            <p className="issue-type-label">{t(`filter.${issue.issueType}` as TranslationKey)}</p>
            <h3>{issue.title}</h3>
          </div>
          <div className="score">
            <span>{t("detail.priority")}</span>
            <strong>{issue.priorityScore.toFixed(1)}</strong>
          </div>
        </div>
        <p className="detail-summary">{issue.summary}</p>
      </div>

      <section>
        <h4>{t("detail.evidence")}</h4>
        <ul className="detail-list">
          {issue.evidence.map((item) => (
            <li key={`${item.label}-${item.detail}`}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>{t("detail.files")}</h4>
        <ul className="tag-list">
          {issue.files.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      </section>

      <section>
        <h4>{t("detail.suggested")}</h4>
        <ul className="detail-list">
          {issue.suggestedActions.map((action) => (
            <li key={action.title}>
              <strong>{action.title}</strong>
              <span>{action.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      {issue.aiExplanation ? (
        <section>
          <h4>{t("detail.aiExplanation")}</h4>
          <p className="detail-summary">{issue.aiExplanation.plainEnglishExplanation}</p>
        </section>
      ) : null}
    </div>
  );
}
