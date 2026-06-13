import { useEffect, useState } from "react";

import { getHistory } from "../../lib/api";
import { useLocale } from "../../lib/i18n";
import type { AnalysisHistoryItem } from "../../lib/types";

interface AnalysisHistoryProps {
  onSelect: (analysisId: string) => void;
  refreshKey?: number;
}

export function AnalysisHistory({ onSelect, refreshKey }: AnalysisHistoryProps) {
  const { t } = useLocale();
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHistory()
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch(() => {
        // silently ignore — server might not be running
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) {
    return <p className="empty">{t("history.empty")}</p>;
  }

  if (history.length === 0) {
    return <p className="empty">{t("history.empty")}</p>;
  }

  return (
    <div className="history-list">
      {history.map((item) => (
        <button
          key={item.id}
          className="history-item"
          onClick={() => onSelect(item.id)}
        >
          <div className="history-item-info">
            <div className="history-item-path" title={item.repoPath}>{item.repoPath}</div>
            <div className="history-item-meta">
              {new Date(item.analyzedAt).toLocaleString()}
            </div>
          </div>
          <div className="history-item-stats">
            <div className="history-stat">
              <span className="history-stat-value">{item.issueCount}</span>
              <span className="history-stat-label">{t("history.issues")}</span>
            </div>
            <div className="history-stat">
              <span className="history-stat-value">{item.highPriorityCount}</span>
              <span className="history-stat-label">{t("history.highPriority")}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
