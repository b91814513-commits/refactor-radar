import type { AnalysisHistoryItem, AnalysisResult, StatusResponse } from "./types";

const API_BASE = "http://127.0.0.1:8787";

export async function startAnalysis(repoPath: string): Promise<{ analysisId: string }> {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ repoPath })
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function getStatus(analysisId: string): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE}/api/analyze/${analysisId}/status`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function getResults(analysisId: string): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE}/api/analyze/${analysisId}/results`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function getHistory(): Promise<AnalysisHistoryItem[]> {
  const response = await fetch(`${API_BASE}/api/analyses`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

