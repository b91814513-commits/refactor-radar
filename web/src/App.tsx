import { useEffect, useMemo, useState } from "react";

import { VisualizationTabs, type VizTab } from "./components/layout/VisualizationTabs";
import { getResults, getStatus, startAnalysis } from "./lib/api";
import type { AnalysisIssue, AnalysisPhase, AnalysisResult, IssueType } from "./lib/types";

const RECENT_KEY = "refactor-radar-recent";

const phaseLabels: Record<AnalysisPhase, string> = {
  discovery: "Scanning repository",
  parsing: "Parsing source files",
  graphing: "Building dependency graph",
  rules: "Evaluating refactor rules",
  scoring: "Ranking findings",
  done: "Completed"
};

function App() {
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
    if (!analysisId || !loading) {
      return;
    }

    const timer = window.setInterval(async () => {
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
    if (selectedType === "all") {
      return issues;
    }
    return issues.filter((issue) => issue.issueType === selectedType);
  }, [results, selectedType]);

  const selectedIssue = useMemo(() => {
    return filteredIssues.find((issue) => issue.id === selectedIssueId) ?? filteredIssues[0] ?? null;
  }, [filteredIssues, selectedIssueId]);

  async function handleAnalyze() {
    if (!repoPath.trim()) {
      setError("Enter a repository path.");
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
        const next = [repoPath.trim(), ...current.filter((value) => value !== repoPath.trim())].slice(0, 5);
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        return next;
      });
    } catch (requestError) {
      setLoading(false);
      setError((requestError as Error).message);
    }
  }

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Local-first repository analysis</p>
          <h1>Refactor Radar</h1>
          <p className="lede">
            Find the most valuable refactor opportunities in a JS or TS repository before technical debt
            turns into architecture drift.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-label">Issue types</span>
            <strong>4</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Analysis mode</span>
            <strong>Static-first</strong>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel analyzer-panel">
          <div className="panel-header">
            <div>
              <h2>Analyze a repository</h2>
              <p>Point Refactor Radar at a local JS/TS project and rank the hotspots worth fixing first.</p>
            </div>
          </div>

          <label className="field">
            <span>Repository path</span>
            <input
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="D:/work/my-app"
            />
          </label>

          <div className="actions">
            <button onClick={handleAnalyze} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze Repo"}
            </button>
            <span className="phase">{loading ? phaseLabels[phase] : "Ready"}</span>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <div className="recent">
            <div className="section-title-row">
              <h3>Recent repositories</h3>
            </div>
            {recentRepos.length === 0 ? (
              <p className="empty">No recent analyses yet.</p>
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
              <h2>Top refactor opportunities</h2>
              <p>Evidence-backed issues sorted by priority, with deterministic signals ahead of narrative guidance.</p>
            </div>
            <div className="filters">
              {["all", "large_module", "dependency_hotspot", "circular_dependency", "duplication_candidate"].map(
                (value) => (
                  <button
                    key={value}
                    className={selectedType === value ? "filter active" : "filter"}
                    onClick={() => setSelectedType(value as typeof selectedType)}
                  >
                    {value.replace(/_/g, " ")}
                  </button>
                )
              )}
            </div>
          </div>

          {results ? (
            <>
              <div className="summary-grid">
                <SummaryCard label="Files" value={results.summary.fileCount} />
                <SummaryCard label="Modules" value={results.summary.moduleCount} />
                <SummaryCard label="Issues" value={results.summary.issueCount} />
                <SummaryCard label="High priority" value={results.summary.highPriorityCount} />
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
                        <span className={`severity severity-${issue.severity}`}>{issue.severity}</span>
                        <span className="confidence">{issue.confidence}</span>
                      </div>
                      <strong>{issue.title}</strong>
                      <p>{issue.summary}</p>
                    </button>
                  ))}
                </div>

                <div className="issue-detail">
                  {selectedIssue ? <IssueDetail issue={selectedIssue} /> : <p className="empty">No issue selected.</p>}
                </div>
              </div>
            </>
          ) : (
            <div className="placeholder">
              <p>Run an analysis to populate the dashboard.</p>
            </div>
          )}
        </section>
      </main>
    </div>
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
  return (
    <div className="detail-stack">
      <div>
        <div className="detail-header">
          <div>
            <p className="eyebrow">{issue.issueType.replace(/_/g, " ")}</p>
            <h3>{issue.title}</h3>
          </div>
          <div className="score">
            <span>Priority</span>
            <strong>{issue.priorityScore.toFixed(1)}</strong>
          </div>
        </div>
        <p className="detail-summary">{issue.summary}</p>
      </div>

      <section>
        <h4>Evidence</h4>
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
        <h4>Files</h4>
        <ul className="tag-list">
          {issue.files.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Suggested refactor path</h4>
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
          <h4>AI explanation</h4>
          <p className="detail-summary">{issue.aiExplanation.plainEnglishExplanation}</p>
        </section>
      ) : null}
    </div>
  );
}

export default App;

