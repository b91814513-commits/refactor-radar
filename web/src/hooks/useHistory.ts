import { useCallback, useEffect, useState } from "react";

import { getHistory } from "../lib/api";
import type { AnalysisHistoryItem } from "../lib/types";

export function useHistory(refreshKey = 0) {
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(() => {
    setLoading(true);
    setError(null);
    getHistory()
      .then((items) => setHistory(items))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [refreshKey, fetchHistory]);

  return { history, loading, error, refresh: fetchHistory };
}
