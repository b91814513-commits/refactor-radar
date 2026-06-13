export type AnalysisPhase =
  | "discovery"
  | "parsing"
  | "graphing"
  | "rules"
  | "scoring"
  | "done";

export type IssueType =
  | "large_module"
  | "dependency_hotspot"
  | "circular_dependency"
  | "duplication_candidate";

export type Severity = "low" | "medium" | "high";
export type Confidence = "heuristic" | "medium" | "high";

export interface FileMetrics {
  lineCount: number;
  importCount: number;
  exportCount: number;
  functionCount: number;
  averageFunctionLength: number;
  fanIn: number;
  fanOut: number;
}

export interface AnalyzedFile {
  path: string;
  imports: string[];
  exports: string[];
  metrics: FileMetrics;
}

export interface EvidenceItem {
  label: string;
  detail: string;
}

export interface IssueMetrics {
  lineCount?: number;
  functionCount?: number;
  exportCount?: number;
  fanIn?: number;
  fanOut?: number;
  duplicateGroupSize?: number;
  cycleSize?: number;
}

export interface SuggestedAction {
  title: string;
  detail: string;
}

export interface AiExplanation {
  plainEnglishExplanation: string;
  refactorOutline: string[];
}

export interface AnalysisIssue {
  id: string;
  issueType: IssueType;
  title: string;
  severity: Severity;
  confidence: Confidence;
  priorityScore: number;
  summary: string;
  files: string[];
  metrics: IssueMetrics;
  evidence: EvidenceItem[];
  suggestedActions: SuggestedAction[];
  aiExplanation?: AiExplanation | null;
}

export interface AnalysisSummary {
  fileCount: number;
  moduleCount: number;
  issueCount: number;
  highPriorityCount: number;
  analyzedAt: string;
}

export interface AnalysisResult {
  analysisId: string;
  repoPath: string;
  summary: AnalysisSummary;
  files: AnalyzedFile[];
  issues: AnalysisIssue[];
}

export interface StatusResponse {
  analysisId: string;
  phase: AnalysisPhase;
  done: boolean;
  error?: string | null;
}

export interface AnalysisHistoryItem {
  id: string;
  repoPath: string;
  analyzedAt: string;
  issueCount: number;
  highPriorityCount: number;
}

