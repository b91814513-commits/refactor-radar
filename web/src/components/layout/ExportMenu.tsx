import { useRef, useState, useEffect } from "react";

import { exportCSV, exportJSON, exportMarkdown } from "../../lib/export";
import { useLocale } from "../../lib/i18n";
import type { AnalysisResult } from "../../lib/types";

interface ExportMenuProps {
  results: AnalysisResult;
}

export function ExportMenu({ results }: ExportMenuProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleExport(format: "json" | "csv" | "markdown") {
    switch (format) {
      case "json":
        exportJSON(results);
        break;
      case "csv":
        exportCSV(results);
        break;
      case "markdown":
        exportMarkdown(results);
        break;
    }
    setOpen(false);
  }

  return (
    <div className="export-menu" ref={menuRef}>
      <button
        className="export-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {t("export.button")}
        <span className="export-toggle-arrow" aria-hidden="true">\u25BE</span>
      </button>
      {open && (
        <div className="export-dropdown" role="menu">
          <button className="export-option" role="menuitem" onClick={() => handleExport("json")}>
            {t("export.json")}
          </button>
          <button className="export-option" role="menuitem" onClick={() => handleExport("csv")}>
            {t("export.csv")}
          </button>
          <button className="export-option" role="menuitem" onClick={() => handleExport("markdown")}>
            {t("export.markdown")}
          </button>
        </div>
      )}
    </div>
  );
}
