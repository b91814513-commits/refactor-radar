import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Boxes,
  CircleAlert,
  FileCode2,
  Flame,
  FolderSearch,
  Languages,
  Radar,
  ShieldCheck,
} from "lucide-react";

import { AnalysisHistory } from "./components/layout/AnalysisHistory";
import { AnalysisProgress } from "./components/layout/AnalysisProgress";
import { EmptyState } from "./components/layout/EmptyState";
import { ExportMenu } from "./components/layout/ExportMenu";
import { VisualizationTabs, type VizTab } from "./components/layout/VisualizationTabs";
import { getResults, getStatus, startAnalysis } from "./lib/api";
import { createTranslator, LocaleContext, useLocale, type Locale, type TranslationKey } from "./lib/i18n";
import type { AnalysisIssue, AnalysisPhase, AnalysisResult, IssueType } from "./lib/types";

const RECENT_KEY = "refactor-radar-recent";
const LOCALE_KEY = "refactor-radar-locale";

const FILTER_KEYS: Record<string, TranslationKey> = {
  all: "filter.all",
  large_module: "filter.large_module",
  dependency_hotspot: "filter.dependency_hotspot",
  circular_dependency: "filter.circular_dependency",
  duplication_candidate: "filter.duplication_candidate",
};

function App() {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    return stored === "zh" ? "zh" : "en";
  });
  const t = useMemo(() => createTranslator(locale), [locale]);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_KEY, next);
  }, []);

  const [repoPath, setRepoPath] = useState("");
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [phase, setPhase] = useState<AnalysisPhase>("discovery");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [selectedType, setSelectedType] = useState<AnalysisIssue["issueType"] | "all">("all");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [recentRepos, setRecentRepos] = useState<string[]>([]);
  const [activeVizTab, setActiveVizTab] = useState<VizTab>("overview");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(RECENT_KEY);
    if (stored) {
      try {
        setRecentRepos(JSON.parse(stored) as string[]);
      } catch {
        window.localStorage.removeItem(RECENT_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!analysisId || !loading) return;
    let attempts = 0;
    const MAX_ATTEMPTS = 600; // 10 minutes at 1s interval
    const timer = window.setInterval(async () => {
      if (++attempts > MAX_ATTEMPTS) {
        window.clearInterval(timer);
        setLoading(false);
        setError(t("analyzer.errorTimeout"));
        return;
      }
      try {
        const status = await getStatus(analysisId);
        setPhase(status.phase);
        if (status.done) {
          window.clearInterval(timer);
          setLoading(false);
          if (status.error) {
            setError(status.error);
            return;
          }
          const payload = await getResults(analysisId);
          setResults(payload);
          setSelectedIssueId(payload.issues[0]?.id ?? null);
          setHistoryRefreshKey((k) => k + 1);
        }
      } catch (statusError) {
        window.clearInterval(timer);
        setLoading(false);
        setError((statusError as Error).message);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [analysisId, loading, t]);

  const filteredIssues = useMemo(() => {
    const issues = results?.issues ?? [];
    if (selectedType === "all") return issues;
    return issues.filter((issue) => issue.issueType === selectedType);
  }, [results, selectedType]);

  const selectedIssue = useMemo(() => {
    return filteredIssues.find((issue) => issue.id === selectedIssueId) ?? filteredIssues[0] ?? null;
  }, [filteredIssues, selectedIssueId]);

  // Stable callbacks so memoized children (charts, history, tabs) don't
  // re-render on every App state change such as selectedIssueId updates.
  const handleTypeClick = useCallback((type: IssueType) => setSelectedType(type), []);
  const handleIssueClick = useCallback((id: string) => setSelectedIssueId(id), []);
  const handleNodeClick = useCallback(
    (filePath: string) => {
      setResults((current) => {
        if (!current) return current;
        const issue = current.issues.find((i) => i.files.includes(filePath));
        if (issue) setSelectedIssueId(issue.id);
        return current;
      });
    },
    [],
  );
  const handleHistorySelect = useCallback(async (id: string) => {
    try {
      const result = await getResults(id);
      setResults(result);
      setSelectedIssueId(result.issues[0]?.id ?? null);
      setSelectedType("all");
    } catch {
      setError(t("history.errorLoad"));
    }
  }, [t]);

  async function handleAnalyze() {
    if (!repoPath.trim()) {
      setError(t("analyzer.errorEmpty"));
      return;
    }
    setError(null);
    setLoading(true);
    setResults(null);
    setSelectedIssueId(null);
    setPhase("discovery");
    try {
      const response = await startAnalysis(repoPath.trim());
      setAnalysisId(response.analysisId);
      setRecentRepos((current) => {
        const next = [repoPath.trim(), ...current.filter((v) => v !== repoPath.trim())].slice(0, 5);
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        return next;
      });
    } catch (requestError) {
      setLoading(false);
      setError((requestError as Error).message);
    }
  }

  const localeCtx = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={localeCtx}>
      <div className="shell">
        <a className="skip-link" href="#workspace">{t("nav.skipToWorkspace")}</a>

        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand" translate="no">
              <span className="brand-mark" aria-hidden="true"><Radar size={18} strokeWidth={1.8} /></span>
              <span>Refactor Radar</span>
            </div>
            <div className="topbar-actions">
              <span className="privacy-status">
                <ShieldCheck size={15} aria-hidden="true" />
                {t("hero.staticFirst")}
              </span>
            <button
              className="lang-toggle"
              onClick={() => setLocale(locale === "en" ? "zh" : "en")}
              aria-label={locale === "en" ? "Switch to Chinese" : "Switch to English"}
            >
                <Languages size={15} aria-hidden="true" />
                <span className="lang-toggle-inner">{t("lang.toggle")}</span>
            </button>
            </div>
          </div>
        </header>

        <main className="workspace" id="workspace">
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
                        value={repoPath}
                        onChange={(event) => setRepoPath(event.target.value)}
                        placeholder={t("analyzer.placeholder")}
                        autoComplete="off"
                        spellCheck={false}
                        list="recent-repositories"
                      />
                    </span>
                  </label>
                  <datalist id="recent-repositories">
                    {recentRepos.map((path) => <option key={path} value={path} />)}
                  </datalist>
                  <button className="btn-primary" type="submit" disabled={loading}>
                    <span>{loading ? t("analyzer.analyzing") : t("analyzer.analyze")}</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </form>

                <AnalysisProgress phase={phase} loading={loading} />
                {error ? <p className="error" role="alert">{error}</p> : null}

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

            {results ? (
              <>
                <div className="summary-row">
                  <div className="summary-grid">
                    <SummaryMetric label={t("dashboard.files")} value={results.summary.fileCount} />
                    <SummaryMetric label={t("dashboard.modules")} value={results.summary.moduleCount} />
                    <SummaryMetric label={t("dashboard.issues")} value={results.summary.issueCount} />
                    <SummaryMetric label={t("dashboard.highPriority")} value={results.summary.highPriorityCount} emphasis />
                  </div>
                  <ExportMenu results={results} />
                </div>

                <VisualizationTabs
                  activeTab={activeVizTab}
                  onTabChange={setActiveVizTab}
                  results={results}
                  onTypeClick={handleTypeClick}
                  onIssueClick={handleIssueClick}
                  onNodeClick={handleNodeClick}
                />

                <div className="findings-toolbar">
                  <div className="findings-count">
                    <strong>{filteredIssues.length}</strong>
                    <span>{t("dashboard.issues")}</span>
                  </div>
                  <div className="filters" role="group" aria-label={t("a11y.filterByIssueType")}>
                    {(["all", "large_module", "dependency_hotspot", "circular_dependency", "duplication_candidate"] as const).map(
                      (value) => (
                        <button
                          key={value}
                          className={selectedType === value ? "filter active" : "filter"}
                          onClick={() => setSelectedType(value as typeof selectedType)}
                          aria-pressed={selectedType === value}
                        >
                          {t(FILTER_KEYS[value])}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="results-grid">
                  <div className="issue-list" aria-label={t("dashboard.issues")}>
                    {filteredIssues.map((issue) => (
                      <button
                        key={issue.id}
                        className={selectedIssue?.id === issue.id ? "issue-row active" : "issue-row"}
                        onClick={() => setSelectedIssueId(issue.id)}
                        aria-pressed={selectedIssue?.id === issue.id}
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
                    {selectedIssue ? <IssueDetail issue={selectedIssue} /> : <p className="empty">{t("detail.noSelected")}</p>}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </section>
        </main>
      </div>
    </LocaleContext.Provider>
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

export default App;
