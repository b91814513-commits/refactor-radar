import { useLocale, type TranslationKey } from "../../lib/i18n";

const FEATURES: { icon: string; key: TranslationKey }[] = [
  { icon: "\u{1F4E6}", key: "empty.featureLargeModule" },
  { icon: "\u{1F517}", key: "empty.featureHotspot" },
  { icon: "\u{1F504}", key: "empty.featureCycle" },
  { icon: "\u{1F4CB}", key: "empty.featureDuplication" },
];

export function EmptyState() {
  const { t } = useLocale();

  return (
    <div className="empty-state">
      <div className="radar-scan" aria-hidden="true">
        <div className="scan-ring scan-ring-1" />
        <div className="scan-ring scan-ring-2" />
        <div className="scan-ring scan-ring-3" />
        <div className="scan-line" />
        <div className="scan-center" />
      </div>

      <h3 className="empty-state-title">{t("empty.title")}</h3>
      <p className="empty-state-hint">{t("empty.hint")}</p>

      <div className="empty-features">
        {FEATURES.map((f) => (
          <div key={f.key} className="empty-feature">
            <span className="empty-feature-icon" aria-hidden="true">{f.icon}</span>
            <span className="empty-feature-text">{t(f.key)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
