import { useLocale, type TranslationKey } from "../../lib/i18n";
import type { AnalysisPhase } from "../../lib/types";

interface AnalysisProgressProps {
  phase: AnalysisPhase;
  loading: boolean;
}

const PHASES: AnalysisPhase[] = [
  "discovery",
  "parsing",
  "graphing",
  "rules",
  "scoring",
  "done",
];

const PHASE_I18N: Record<AnalysisPhase, TranslationKey> = {
  discovery: "phase.discovery",
  parsing: "phase.parsing",
  graphing: "phase.graphing",
  rules: "phase.rules",
  scoring: "phase.scoring",
  done: "phase.done",
};

export function AnalysisProgress({ phase, loading }: AnalysisProgressProps) {
  const { t } = useLocale();
  const currentIndex = PHASES.indexOf(phase);

  if (!loading && phase === "discovery") {
    return null;
  }

  return (
    <div className="progress-steps" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={PHASES.length}>
      {PHASES.map((p, i) => {
        const isComplete = i < currentIndex || (!loading && phase === "done");
        const isCurrent = i === currentIndex && loading;
        const isPending = i > currentIndex && loading;

        return (
          <div key={p} className="progress-step-wrapper">
            {i > 0 && (
              <div
                className={`progress-line ${isComplete || isCurrent ? "active" : ""}`}
              />
            )}
            <div
              className={`progress-step ${isComplete ? "complete" : ""} ${isCurrent ? "current" : ""} ${isPending ? "pending" : ""}`}
            >
              <div className="progress-dot" />
              <span className="progress-label">{t(PHASE_I18N[p])}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
