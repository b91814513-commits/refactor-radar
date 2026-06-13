import { useCallback, useEffect, useMemo, useState } from "react";

import { VisualizationTabs, type VizTab } from "./components/layout/VisualizationTabs";
import { getResults, getStatus, startAnalysis } from "./lib/api";
import { createTranslator, LocaleContext, useLocale, type Locale, type TranslationKey } from "./lib/i18n";
import type { AnalysisIssue, AnalysisPhase, AnalysisResult, IssueType } from "./lib/types";

const RECENT_KEY = "refactor-radar-recent";
const LOCALE_KEY = "refactor-radar-locale";

const PHASE_KEYS: Record<AnalysisPhase, TranslationKey> = {
  discovery: "phase.discovery",
  parsing: "phase.parsing",
  graphing: "phase.graphing",
  rules: "phase.rules",
  scoring: "phase.scoring",
  done: "phase.done",
};

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
        setError("Analysis timed out. The server may be unresponsive.");
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
        }
      } catch (statusError) {
        window.clearInterval(timer);
        setLoading(false);
        setError((statusError as Error).message);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [analysisId, loading]);

  const filteredIssues = useMemo(() => {
    const issues = results?.issues ?? [];
    if (selectedType === "all") return issues;
    return issues.filter((issue) => issue.issueType === selectedType);
  }, [results, selectedType]);

  const selectedIssue = useMemo(() => {
    return filteredIssues.find((issue) => issue.id === selectedIssueId) ?? filteredIssues[0] ?? null;
  }, [filteredIssues, selectedIssueId]);

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
        {/* Radar pulse decoration */}
        <div className="radar-bg" aria-hidden="true" />

        <header className="hero">
          <div className="hero-text">
            <p className="eyebrow">{t("hero.eyebrow")}</p>
            <h1 className="hero-title">
              <span className="radar-dot" aria-hidden="true" />
              Refactor Radar
            </h1>
            <p className="lede">{t("hero.lede")}</p>
          </div>
          <div className="hero-right">
            <button
              className="lang-toggle"
              onClick={() => setLocale(locale === "en" ? "zh" : "en")}
              aria-label={locale === "en" ? "Switch to Chinese" : "Switch to English"}
            >
              <span className="lang-toggle-inner">{t("lang.toggle")}</span>
            </button>
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-label">{t("hero.issueTypes")}</span>
                <strong>4</strong>
              </div>
              <div className="stat">
                <span className="stat-label">{t("hero.analysisMode")}</span>
                <strong>{t("hero.staticFirst")}</strong>
              </div>
            </div>
          </div>
        </header>

        <main className="layout">
          <section className="panel analyzer-panel">
            <div className="panel-header">
              <div>
                <h2>{t("analyzer.title")}</h2>
                <p>{t("analyzer.desc")}</p>
              </div>
            </div>

            <label className="field">
              <span>{t("analyzer.repoPath")}</span>
              <input
                name="repoPath"
                value={repoPath}
                onChange={(event) => setRepoPath(event.target.value)}
                placeholder={t("analyzer.placeholder")}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <div className="actions">
              <button className="btn-primary" onClick={handleAnalyze} disabled={loading}>
                {loading ? t("analyzer.analyzing") : t("analyzer.analyze")}
              </button>
              <span className="phase">
                {loading ? t(PHASE_KEYS[phase]) : t("analyzer.ready")}
              </span>
            </div>

            {error ? <p className="error" role="alert">{error}</p> : null}

            <div className="recent">
              <div className="section-title-row">
                <h3>{t("analyzer.recent")}</h3>
              </div>
              {recentRepos.length === 0 ? (
                <p className="empty">{t("analyzer.noRecent")}</p>
              ) : (
                <ul>
                  {recentRepos.map((path) => (
                    <li key={path}>
                      <button className="link-button" onClick={() => setRepoPath(path)}>
                        {path}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel dashboard-panel">
            <div className="panel-header">
              <div>
                <h2>{t("dashboard.title")}</h2>
                <p>{t("dashboard.desc")}</p>
              </div>
              <div className="filters" role="group" aria-label="Filter by issue type">
                {(["all", "large_module", "dependency_hotspot", "circular_dependency", "duplication_candidate"] as const).map(
                  (value) => (
                    <button
                      key={value}
                      className={selectedType === value ? "filter active" : "filter"}
                      onClick={() => setSelectedType(value as typeof selectedType)}
                    >
                      {t(FILTER_KEYS[value])}
                    </button>
                  ),
                )}
              </div>
            </div>

            {results ? (
              <>
                <div className="summary-grid">
                  <SummaryCard label={t("dashboard.files")} value={results.summary.fileCount} />
                  <SummaryCard label={t("dashboard.modules")} value={results.summary.moduleCount} />
                  <SummaryCard label={t("dashboard.issues")} value={results.summary.issueCount} />
                  <SummaryCard label={t("dashboard.highPriority")} value={results.summary.highPriorityCount} />
                </div>

                <VisualizationTabs
                  activeTab={activeVizTab}
                  onTabChange={setActiveVizTab}
                  results={results}
                  onTypeClick={(type: IssueType) => setSelectedType(type)}
                  onIssueClick={(id: string) => setSelectedIssueId(id)}
                  onNodeClick={(filePath: string) => {
                    const issue = results.issues.find((i) => i.files.includes(filePath));
                    if (issue) setSelectedIssueId(issue.id);
                  }}
                />

                <div className="results-grid">
                  <div className="issue-list">
                    {filteredIssues.map((issue) => (
                      <button
                        key={issue.id}
                        className={selectedIssue?.id === issue.id ? "issue-row active" : "issue-row"}
                        onClick={() => setSelectedIssueId(issue.id)}
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

                  <div className="issue-detail">
                    {selectedIssue ? <IssueDetail issue={selectedIssue} /> : <p className="empty">{t("detail.noSelected")}</p>}
                  </div>
                </div>
              </>
            ) : (
              <div className="placeholder">
                <p>{t("dashboard.placeholder")}</p>
              </div>
            )}
          </section>
        </main>
      </div>
    </LocaleContext.Provider>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-card">
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
            <p className="eyebrow">{t(`filter.${issue.issueType}` as TranslationKey)}</p>
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
