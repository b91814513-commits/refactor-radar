import type { AnalysisConfigInput, AnalysisHistoryItem, AnalysisResult, StatusResponse } from "./types";

export const API_BASE = import.meta.env.VITE_API_BASE as string | undefined ?? "http://127.0.0.1:8787";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}

export async function startAnalysis(repoPath: string, config?: AnalysisConfigInput): Promise<{ analysisId: string }> {
  const body = { repoPath, ...(config && { config }) };
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function getStatus(analysisId: string): Promise<StatusResponse> {
  const response = await fetchWithRetry(`${API_BASE}/api/analyze/${analysisId}/status`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function getResults(analysisId: string): Promise<AnalysisResult> {
  const response = await fetchWithRetry(`${API_BASE}/api/analyze/${analysisId}/results`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function getHistory(): Promise<AnalysisHistoryItem[]> {
  const response = await fetchWithRetry(`${API_BASE}/api/analyses`);
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
