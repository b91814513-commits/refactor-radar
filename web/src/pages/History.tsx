import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

import { getResults } from "../lib/api";
import { useHistory } from "../hooks/useHistory";
import { useLocale } from "../lib/i18n";
import { ListSkeleton } from "../components/common/Skeleton";

export function History() {
  const { locale, t } = useLocale();
  const { history, loading } = useHistory();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!search.trim()) return history;
    const q = search.toLowerCase();
    return history.filter((item) => item.repoPath.toLowerCase().includes(q));
  }, [history, search]);

  async function handleLoad(id: string) {
    try {
      await getResults(id);
      navigate("/");
    } catch {
      // silently ignore
    }
  }

  return (
    <section className="history-page" aria-labelledby="history-page-title">
      <div className="history-page-header">
        <p className="section-kicker">{t("history.pageTitle")}</p>
        <h1 id="history-page-title">{t("history.pageTitle")}</h1>
        <p>{t("history.pageDesc")}</p>
      </div>

      <div className="history-search-wrap">
        <span className="history-search-icon" aria-hidden="true"><Search size={16} /></span>
        <input
          className="history-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("history.search")}
          aria-label={t("history.search")}
        />
      </div>

      {loading ? (
        <ListSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <p className="empty">{search ? t("history.noResults") : t("history.empty")}</p>
      ) : (
        <div className="history-page-list">
          {filtered.map((item) => (
            <div key={item.id} className="history-page-item">
              <div className="history-page-item-info">
                <div className="history-item-path" title={item.repoPath}>{item.repoPath}</div>
                <div className="history-item-meta">
                  {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
                    dateStyle: "short",
                    timeStyle: "medium",
                  }).format(new Date(item.analyzedAt))}
                  {" · "}
                  {item.issueCount} {t("history.issues")}
                  {" · "}
                  {item.highPriorityCount} {t("history.highPriority")}
                </div>
              </div>
              <button className="btn-primary history-load-btn" onClick={() => handleLoad(item.id)}>
                {t("history.load")}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
