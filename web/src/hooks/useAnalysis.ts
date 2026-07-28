import { useCallback, useEffect, useMemo, useState } from "react";

import { getResults, getStatus, startAnalysis } from "../lib/api";
import type { TranslationKey } from "../lib/i18n";
import type { AnalysisIssue, AnalysisPhase, AnalysisResult, IssueType } from "../lib/types";

const RECENT_KEY = "refactor-radar-recent";

interface UseAnalysisOptions {
  t: (key: TranslationKey) => string;
  onToast?: (message: string) => void;
}

export function useAnalysis({ t, onToast }: UseAnalysisOptions) {
  const [repoPath, setRepoPath] = useState("");
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [phase, setPhase] = useState<AnalysisPhase>("discovery");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [selectedType, setSelectedType] = useState<AnalysisIssue["issueType"] | "all">("all");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [recentRepos, setRecentRepos] = useState<string[]>([]);

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
    const MAX_ATTEMPTS = 600;
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
            onToast?.(status.error);
            return;
          }
          const payload = await getResults(analysisId);
          setResults(payload);
          setSelectedIssueId(payload.issues[0]?.id ?? null);
        }
      } catch (statusError) {
        window.clearInterval(timer);
        setLoading(false);
        const msg = (statusError as Error).message;
        setError(msg);
        onToast?.(msg);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [analysisId, loading, t, onToast]);

  const filteredIssues = useMemo(() => {
    const issues = results?.issues ?? [];
    if (selectedType === "all") return issues;
    return issues.filter((issue) => issue.issueType === selectedType);
  }, [results, selectedType]);

  const selectedIssue = useMemo(() => {
    return filteredIssues.find((issue) => issue.id === selectedIssueId) ?? filteredIssues[0] ?? null;
  }, [filteredIssues, selectedIssueId]);

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

  const handleAnalyze = useCallback(async () => {
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
      const msg = (requestError as Error).message;
      setError(msg);
      onToast?.(msg);
    }
  }, [repoPath, t, onToast]);

  const loadResults = useCallback(async (id: string) => {
    try {
      const result = await getResults(id);
      setResults(result);
      setSelectedIssueId(result.issues[0]?.id ?? null);
      setSelectedType("all");
    } catch {
      const msg = t("history.errorLoad");
      setError(msg);
      onToast?.(msg);
    }
  }, [t, onToast]);

  return {
    repoPath, setRepoPath,
    analysisId,
    phase,
    loading,
    error, setError,
    results, setResults,
    selectedType, setSelectedType,
    selectedIssueId, setSelectedIssueId,
    recentRepos,
    filteredIssues,
    selectedIssue,
    handleTypeClick,
    handleIssueClick,
    handleNodeClick,
    handleAnalyze,
    loadResults,
  };
}
